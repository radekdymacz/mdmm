#pragma once

#include <cstdint>

namespace md
{
	// B-133. Machinedrum OS 1.63 keeps the objects of the screen that is shown in a doubly linked list (a head cell, a
	// tail cell, nodes of 924 bytes in RAM). The main screen's list is three nodes, g_mainFirst, 0x280e06 and
	// g_mainLast. Showing a screen of its own takes the three out and puts one node of its own in; leaving puts the
	// three back. The "RECEIVING SAMPLE" screen, which a sample sent by SDS opens (the header opens it, the end of the
	// transfer closes it), does that with the list's cells left in a state the OS's own unlink and append cannot mend:
	// a node's PREV link that points at the old tail (set by the append that built the list, g_mainFirst's prev is
	// g_mainLast) is copied into the head by the unlink of the second node. After the screen is left the head cell
	// names g_mainLast, the tail cell names g_mainLast too (a list of one node), and the machine takes no live
	// recording (no TRIG key, no knob lock) until it starts again. Measured by bisecting the RAM that brings
	// recording back (0x250000 to 0x2b8000, mdDeskFirmwareTest recaftersample): the two bytes at 0x28092e.
	//
	// The emulated machine runs the OS as it is, so this is the OS's own fault, not the SDS sender's (the sender
	// follows the SDS handshake; the same state follows from every transfer). The way out is to put the head cell
	// back: once the list has been a single g_mainLast for a moment (the OS finishes the swap in a few instructions
	// under its own lock; the main screen never has fewer than three nodes), the head cell is written with
	// g_mainFirst, the node the OS itself put there before. Pure: the machine's memory comes in as two functions.
	class ScreenListFix
	{
	public:
		static constexpr uint32_t g_tailAddress = 0x280928;
		static constexpr uint32_t g_headAddress = 0x28092c;
		static constexpr uint32_t g_mainFirst = 0x2811a2;
		static constexpr uint32_t g_mainLast = 0x280a6a;
		// 100 ms at 48 kHz: far longer than any swap, far shorter than a person's next key
		static constexpr uint32_t g_holdFrames = 4800;

		// Once per audio block, on the thread that runs the firmware. True: the head cell was written.
		template<typename Read32, typename Write32>
		bool update(const uint32_t _frames, Read32&& _read32, Write32&& _write32)
		{
			if(_read32(g_headAddress) != g_mainLast || _read32(g_tailAddress) != g_mainLast)
			{
				m_heldFrames = 0;
				return false;
			}
			m_heldFrames += _frames;
			if(m_heldFrames < g_holdFrames)
				return false;
			m_heldFrames = 0;
			_write32(g_headAddress, g_mainFirst);
			++m_fixes;
			return true;
		}

		// How many times the head cell was put back
		uint32_t fixes() const { return m_fixes; }

	private:
		uint32_t m_heldFrames = 0;
		uint32_t m_fixes = 0;
	};
}
