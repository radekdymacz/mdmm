#include "mdLib/mdhardware.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <initializer_list>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace
{
	void require(bool condition, const char* message)
	{
		if(!condition) throw std::runtime_error(message);
	}

	std::vector<uint8_t> load(const char* path)
	{
		std::ifstream file(path, std::ios::binary);
		require(bool(file), "cannot open fixture");
		return {std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>()};
	}

	// Independent firmware observation, not a TurboMidiTransfer fixture. Inputs
	// are injected as bytes; UART1 does not simulate serial bits or baud mismatch.
	// Dividers at reply EOX mean firmware UTB-write time, NOT physical TX completion.
	class PeerProbe
	{
	public:
		explicit PeerProbe(md::Hardware& hardware) : m_hardware(hardware)
		{
			m_hardware.getUC().setMidiTransmitTap([this](uint8_t byte)
			{
				if(byte >= 0xf8) return;
				if(byte == 0xf0) m_partial.clear();
				if(m_partial.empty() && byte != 0xf0) return;
				m_partial.push_back(byte);
				if(byte == 0xf7)
				{
					m_replies.push_back({m_partial, divider()});
					std::printf("peer cycles=%llu divider=%u bytes=",
						static_cast<unsigned long long>(m_hardware.getUC().getCycles()), divider());
					for(auto b : m_partial) std::printf(" %02x", b);
					std::puts("");
					m_partial.clear();
				}
			});
		}
		~PeerProbe() { m_hardware.getUC().setMidiTransmitTap({}); }

		uint16_t divider()
		{
			auto& sim = m_hardware.getUC().getSim();
			return (uint16_t(sim.read8(md::Sim::g_uart1Base + md::Sim::g_uartBg1)) << 8)
				| sim.read8(md::Sim::g_uart1Base + md::Sim::g_uartBg2);
		}

		void writeByte(uint8_t byte)
		{
			require(m_hardware.getUC().tryWriteMidiByte(byte), "firmware RX queue full");
			advance(44); // About 1ms per byte: below the documented slave byte timeout.
		}

		void send(uint8_t command, std::initializer_list<uint8_t> data = {})
		{
			m_replies.clear();
			for(auto byte : frame(command, data)) writeByte(byte);
			advance(88); // Observe divider writes following reply EOX.
		}

		void expect(uint8_t command, std::initializer_list<uint8_t> data,
			uint16_t atReply, uint16_t afterReply)
		{
			const auto expected = frame(command, data);
			const auto found = std::find_if(m_replies.begin(), m_replies.end(),
				[&](const Reply& reply) { return reply.bytes == expected; });
			require(found != m_replies.end(), "missing or unexpected firmware reply");
			require(found->divider == atReply, "unexpected divider at reply EOX");
			require(divider() == afterReply, "unexpected divider after reply");
			std::printf("verified command=%02x divider-at-EOX=%u divider-after=%u\n",
				command, atReply, afterReply);
		}

	private:
		struct Reply { std::vector<uint8_t> bytes; uint16_t divider; };
		static std::vector<uint8_t> frame(uint8_t command, std::initializer_list<uint8_t> data)
		{
			std::vector<uint8_t> result{0xf0, 0, 0x20, 0x3c, 0, 0, command};
			result.insert(result.end(), data);
			result.push_back(0xf7);
			return result;
		}
		void advance(unsigned frames)
		{
			for(unsigned i = 0; i < frames; ++i) m_hardware.advance(1);
		}
		md::Hardware& m_hardware;
		std::vector<uint8_t> m_partial;
		std::vector<Reply> m_replies;
	};
}

int main(int argc, char** argv)
{
	if(argc != 4 || (std::string(argv[1]) != "md" && std::string(argv[1]) != "mm"))
	{
		std::puts("usage: mdTurboMidiFirmwareTest md <MD-1.63-ROM> <factory-cache>\n"
			"       mdTurboMidiFirmwareTest mm <MM-1.32b-ROM> <1MiB-patch-RAM>");
		return 2;
	}
	try
	{
		const bool mm = std::string(argv[1]) == "mm";
		const auto rom = load(argv[2]), seed = load(argv[3]);
		std::vector<uint8_t> flash;
		if(mm) require(seed.size() == 0x100000, "MM patch RAM must be 1MiB");
		else require(md::decodeFactoryFlashCache(flash, seed, rom), "invalid MD factory cache");
		auto hardware = std::make_unique<md::Hardware>(rom, argv[2],
			mm ? md::MachineModel::Monomachine : md::MachineModel::Machinedrum,
			mm ? seed : std::vector<uint8_t>{}, std::shared_ptr<md::FrontPanelPublisher>{},
			flash, mm ? std::vector<uint8_t>{} : seed);
		require(hardware->isValid(), "invalid firmware");
		const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(90);
		for(uint32_t frames = 0; frames < md::g_samplerate * 20; frames += 64)
		{
			require(std::chrono::steady_clock::now() < deadline, "boot timed out");
			hardware->advance(64);
		}
		require(hardware->isFirmwareMidiReady(), "firmware MIDI not ready");
		PeerProbe peer(*hardware);
		require(peer.divider() == 40, "unexpected initial MIDI divider");
		peer.send(0x10);
		// Recorded MD 1.63 and MM 1.32b report. This fixed vector alone does not
		// establish the meaning of every capability bit, especially bit zero.
		peer.expect(0x11, {0x7f, 1, 0x0f, 0}, 40, 40);
		peer.send(0x12, {8, 7}); // unequal speeds: 10x test, 8x transfer
		peer.expect(0x13, {}, 40, 4);
		for(unsigned i = 0; i < 16; ++i) peer.writeByte(0);
		peer.send(0x14, {0x55, 0x55, 0x55, 0x55, 0, 0, 0, 0});
		peer.expect(0x15, {0x55, 0x55, 0x55, 0x55, 0, 0, 0, 0}, 4, 4);
		peer.send(0x16);
		peer.expect(0x17, {}, 4, 5);
		std::puts("TurboMIDI firmware report and unequal-speed divider checks passed");
		return 0;
	}
	catch(const std::exception& error)
	{
		std::fprintf(stderr, "TurboMIDI firmware check failed: %s\n", error.what());
		return 1;
	}
}
