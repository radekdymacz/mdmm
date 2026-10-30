#include "mmWave.h"

#include "sysex7bit.h"

#include <algorithm>
#include <cmath>
#include <complex>

namespace elektronData
{
	namespace
	{
		constexpr uint8_t g_header[] = {0xf0, 0x00, 0x20, 0x3c, 0x03, 0x00, 0x5d};
		constexpr size_t g_dataAt = 14;
		constexpr double g_pi = 3.14159265358979323846;

		// the 14-bit sum of bytes 10 up to the trailer (the position byte, 9, is outside it)
		uint32_t sumOf(const std::vector<uint8_t>& _m)
		{
			uint32_t sum = 0;
			for(size_t i = 10; i + 5 < _m.size(); ++i)
				sum += _m[i];
			return sum & 0x3fff;
		}

		bool isWaveDump(const std::vector<uint8_t>& _m)
		{
			return _m.size() == g_mmWaveDumpSize && std::equal(std::begin(g_header), std::end(g_header), _m.begin()) && _m.back() == 0xf7;
		}

		bool nameChar(const char _c)
		{
			return (_c >= 'A' && _c <= 'Z') || (_c >= '0' && _c <= '9') || _c == ' ' || _c == '-' || _c == '+' || _c == '.' || _c == '/' || _c == '#';
		}

		char upper(const char _c) { return _c >= 'a' && _c <= 'z' ? static_cast<char>(_c - 'a' + 'A') : _c; }

		int32_t sampleAt(const std::vector<uint8_t>& _data, const size_t _i)
		{
			const uint32_t raw = (uint32_t(_data[_i * 3]) << 16) | (uint32_t(_data[_i * 3 + 1]) << 8) | _data[_i * 3 + 2];
			return static_cast<int32_t>(raw ^ 0x800000u) - 0x800000;
		}
	}

	std::optional<MmWave> decodeMmWave(const std::vector<uint8_t>& _sysex)
	{
		if(!isWaveDump(_sysex))
			return std::nullopt;
		for(size_t i = 1; i + 1 < _sysex.size(); ++i)
			if(_sysex[i] & 0x80)
				return std::nullopt;
		const size_t n = _sysex.size();
		const uint32_t sum = (uint32_t(_sysex[n - 5]) << 7) | _sysex[n - 4];
		const uint32_t length = (uint32_t(_sysex[n - 3]) << 7) | _sysex[n - 2];
		if(sum != sumOf(_sysex) || length != n - 10)
			return std::nullopt;
		MmWave w;
		w.version = _sysex[7];
		w.revision = _sysex[8];
		w.position = _sysex[9];
		if(w.position >= g_mmWaveSlots)
			return std::nullopt;
		for(size_t i = 0; i < g_mmWaveNameSize; ++i)
			w.name[i] = _sysex[10 + i];
		w.data = decode7Bit(_sysex.data() + g_dataAt, n - 5 - g_dataAt);
		if(w.data.size() < g_mmWaveDataSize)
			return std::nullopt;
		w.data.resize(g_mmWaveDataSize);
		return w;
	}

	std::vector<uint8_t> encodeMmWave(const MmWave& _wave)
	{
		std::vector<uint8_t> m(std::begin(g_header), std::end(g_header));
		m.push_back(_wave.version & 0x7f);
		m.push_back(_wave.revision & 0x7f);
		m.push_back(_wave.position & 0x3f);
		for(const auto c : _wave.name)
			m.push_back(c & 0x7f);
		auto data = _wave.data;
		data.resize(g_mmWaveDataSize, 0);
		const auto enc = encode7Bit(data.data(), data.size());
		m.insert(m.end(), enc.begin(), enc.end());
		m.resize(m.size() + 5);
		const size_t n = m.size();
		const auto sum = sumOf(m);
		m[n - 5] = static_cast<uint8_t>(sum >> 7);
		m[n - 4] = static_cast<uint8_t>(sum & 0x7f);
		m[n - 3] = static_cast<uint8_t>(((n - 10) >> 7) & 0x7f);
		m[n - 2] = static_cast<uint8_t>((n - 10) & 0x7f);
		m[n - 1] = 0xf7;
		return m;
	}

	std::vector<uint8_t> mmWavePlaced(const std::vector<uint8_t>& _sysex, const uint8_t _position)
	{
		if(!isWaveDump(_sysex))
			return _sysex;
		auto m = _sysex;
		m[9] = _position & 0x3f;
		return m;
	}

	std::string mmWaveName(const MmWave& _wave)
	{
		std::string s;
		for(const auto c : _wave.name)
			s += c >= 0x20 && c < 0x7f ? static_cast<char>(c) : ' ';
		while(!s.empty() && s.back() == ' ')
			s.pop_back();
		return s;
	}

	std::string mmWaveNameProblem(const std::string& _name)
	{
		if(_name.size() > g_mmWaveNameSize)
			return "A waveform's name has at most four characters.";
		for(const auto c : _name)
			if(!nameChar(upper(c)))
				return std::string("A waveform's name takes A to Z, 0 to 9, space and - + . / #, not '") + c + "'.";
		return {};
	}

	void setMmWaveName(MmWave& _wave, const std::string& _name)
	{
		for(size_t i = 0; i < g_mmWaveNameSize; ++i)
			_wave.name[i] = static_cast<uint8_t>(i < _name.size() ? upper(_name[i]) : ' ');
	}

	std::vector<double> mmWaveLevel(const MmWave& _wave, const size_t _level)
	{
		if(_level >= g_mmWaveLevels || _wave.data.size() < g_mmWaveDataSize)
			return {};
		std::vector<double> out(mmWaveLevelPoints(_level));
		const auto start = mmWaveLevelStart(_level);
		for(size_t i = 0; i < out.size(); ++i)
			out[i] = static_cast<double>(sampleAt(_wave.data, start + i)) / 8388608.0;
		return out;
	}

	std::vector<double> mmWavePoints(const MmWave& _wave, const size_t _count)
	{
		const auto level = mmWaveLevel(_wave, 0);
		if(level.empty() || !_count)
			return {};
		std::vector<double> out(_count);
		for(size_t i = 0; i < _count; ++i)
			out[i] = level[i * level.size() / _count];
		return out;
	}

	std::optional<MmWave> mmWaveFromCycle(const std::vector<float>& _cycle, const uint8_t _position, const std::string& _name, std::string& _why)
	{
		const size_t frames = _cycle.size();
		if(frames < 8)
		{
			_why = "The audio is too short for one cycle (at least 8 frames).";
			return std::nullopt;
		}
		if(frames > g_mmWaveMaxFrames)
		{
			_why = "The audio is longer than one cycle can be (" + std::to_string(g_mmWaveMaxFrames) + " frames): cut one period out of it first.";
			return std::nullopt;
		}
		for(const auto s : _cycle)
		{
			if(!std::isfinite(s))
			{
				_why = "The audio holds values that are not numbers.";
				return std::nullopt;
			}
		}
		if(const auto problem = mmWaveNameProblem(_name); !problem.empty())
		{
			_why = problem;
			return std::nullopt;
		}
		// The cycle's harmonics 1 to 511 (the ones level 0 can hold; fewer for a shorter cycle), DC left off.
		const size_t harmonics = std::min(g_mmWavePoints / 2 - 1, (frames - 1) / 2);
		std::vector<std::complex<double>> c(harmonics + 1);
		for(size_t k = 1; k <= harmonics; ++k)
		{
			std::complex<double> sum = 0;
			for(size_t n = 0; n < frames; ++n)
			{
				const double phase = -2.0 * g_pi * static_cast<double>(k) * static_cast<double>(n) / static_cast<double>(frames);
				sum += static_cast<double>(_cycle[n]) * std::complex<double>(std::cos(phase), std::sin(phase));
			}
			c[k] = sum * (2.0 / static_cast<double>(frames));
		}
		// Each level at its points, with the harmonics below half of them.
		std::vector<std::vector<double>> levels(g_mmWaveLevels);
		for(size_t l = 0; l < g_mmWaveLevels; ++l)
		{
			const size_t points = mmWaveLevelPoints(l);
			const size_t top = std::min(harmonics, points / 2 - 1);
			auto& v = levels[l];
			v.assign(points, 0.0);
			for(size_t k = 1; k <= top; ++k)
			{
				const double a = std::abs(c[k]), p = std::arg(c[k]);
				if(a == 0)
					continue;
				for(size_t n = 0; n < points; ++n)
					v[n] += a * std::cos(2.0 * g_pi * static_cast<double>(k) * static_cast<double>(n) / static_cast<double>(points) + p);
			}
		}
		double peak = 0;
		for(const auto x : levels[0])
			peak = std::max(peak, std::abs(x));
		if(peak < 1e-6)
		{
			_why = "The audio is silent (or only DC): there is no waveform in it.";
			return std::nullopt;
		}
		const double gain = std::pow(10.0, -0.1 / 20.0) / peak;
		MmWave w;
		w.position = _position & 0x3f;
		setMmWaveName(w, _name);
		w.data.reserve(g_mmWaveDataSize);
		for(const auto& v : levels)
		{
			for(const auto x : v)
			{
				const auto q = static_cast<int32_t>(std::clamp(std::lround(x * gain * 8388607.0), -8388608L, 8388607L));
				const auto u = static_cast<uint32_t>(q) & 0xffffff;
				w.data.push_back(static_cast<uint8_t>(u >> 16));
				w.data.push_back(static_cast<uint8_t>((u >> 8) & 0xff));
				w.data.push_back(static_cast<uint8_t>(u & 0xff));
			}
		}
		return w;
	}
}
