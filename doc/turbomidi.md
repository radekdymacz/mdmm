# TurboMIDI negotiation reference

TurboMIDI negotiates a faster MIDI serial link between an **initiator** (the host)
and a **responder** (the instrument). This guide explains the exchange using
Machinedrum OS 1.63 and Monomachine OS 1.32b as the implementation examples.
It covers negotiation and recovery; subsequent SysEx payloads, including MIDI
Sample Dump Standard (SDS), have their own protocols.

Three kinds of information are identified below: the published protocol,
observations of firmware running in the emulator, and Gearmulator's sender policy.
Isolated capability reports and firmware instruction inspection establish the bit
mapping and the responder's transmit-complete wait. The emulator does not validate
physical UART interoperability.

## Frames and speeds

Negotiation frames have this layout; byte values are hexadecimal:

```text
F0 00 20 3C 00 00 COMMAND DATA... F7
```

`00 20 3C` identifies Elektron; the following two zero bytes select the generic
product and padding/base-channel field. MIDI realtime bytes may interleave with
SysEx and are excluded from the frame's length. The worked exchange below shows
all frame bytes, including their prefix and terminating `F7`.

Speed codes and Gearmulator's pacing rates are:

| Code (decimal) | Nominal multiplier | Host admission rate (bytes/s) |
| ---: | ---: | ---: |
| 1 | 1× | 3,125 |
| 2 | 2× | 6,250 |
| 3 | 3.33× | 10,406 |
| 4 | 4× | 12,500 |
| 5 | 5× | 15,625 |
| 6 | 6.66× | 20,812 |
| 7 | 8× | 25,000 |
| 8 | 10× | 31,250 |

MIDI uses 8-N-1 framing: ten serial bits per byte. Standard MIDI is 31,250 bit/s;
8× and 10× correspond to 250,000 and 312,500 bit/s. The table retains the sender's
integer rounding for fractional multipliers. Those byte rates are admission
limits, not UART register settings. The manual lists codes 9–11 as unsupported
by these instruments. The tested firmware nevertheless accepts code 9 and programs
divider 3 (13.33×); codes 10 and 11 are rejected. This is a firmware observation,
not a claim of reliable physical operation at 13.33×. See [Elektron's Appendix C](https://www.elektron.se/wp-content/uploads/2024/09/machinedrum_manual_OS1.63.pdf#page=118)
for the published message and speed definitions.

## Complete worked exchange

Both tested firmware profiles return capability data `7F 01 0F 00`. The four
bytes are supported-low, supported-high, certified-low, certified-high.
Firmware interprets this as supported codes 2–9 and certified codes 2–5.
Gearmulator combines each pair as `low | (high << 7)` and interprets bit *n* as
code *n + 1*. Under that interpretation it chooses code 8 for SPEED1 (10×), then
code 7 for SPEED2 (8×): its policy selects the next supported code when the highest
code is uncertified, without a second certification check. This is the sender's
selection heuristic, including the retained off-by-one decoder described below.

The **UART rate** column follows the manual's transition order and the firmware
divider observations. The **Gearmulator** column describes host-to-instrument byte
admission, including its earlier pacing change. It does not control a physical UART.

| Direction / purpose | Complete bytes | UART rate for this message | Gearmulator admission/action |
| --- | --- | --- | --- |
| Host → instrument: request capabilities | `F0 00 20 3C 00 00 10 F7` | 1× | Admit at 1× |
| Instrument → host: report capabilities | `F0 00 20 3C 00 00 11 7F 01 0F 00 F7` | 1× | Select codes 8 and 7 |
| Host → instrument: negotiate | `F0 00 20 3C 00 00 12 08 07 F7` | 1× | Admit at 1× |
| Instrument → host: acknowledge | `F0 00 20 3C 00 00 13 F7` | 1×; switch to SPEED1 afterward | Set host pacing to 10× after observing reply |
| Host → instrument: padding (not SysEx) | `00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00` | 10× | Admit at 10× |
| Host → instrument: first test | `F0 00 20 3C 00 00 14 55 55 55 55 00 00 00 00 F7` | 10× | Admit at 10× |
| Instrument → host: echo test pattern | `F0 00 20 3C 00 00 15 55 55 55 55 00 00 00 00 F7` | 10× | Check echo; set host pacing to 8× |
| Host → instrument: second test | `F0 00 20 3C 00 00 16 F7` | 10× | **Admit at 8×**, retaining existing sender policy |
| Instrument → host: second result | `F0 00 20 3C 00 00 17 F7` | 10×; switch to SPEED2 afterward | Keep 8× pacing; start a 10 ms settling pause |

After settling, Gearmulator admits the payload at 8×. The sixteen padding bytes
allow the responder time to change speed and reset its UART after the initial
acknowledgement. The extra 10 ms pause before payload is a Gearmulator workaround
for observed MD 1.63 UART-reset behavior that could otherwise drop the initial
SDS header.

### What the firmware probe establishes

The independent [firmware probe](../source/elektron/md/mdLibTest/turboMidiFirmwareTest.cpp)
sends its own handshake bytes, bypassing `TurboMidiTransfer`. On both firmware
profiles it observes these UART1 divider values (decimal):

| Reply | Divider when firmware writes the reply-ending `F7` to UTB | Divider afterward |
| --- | ---: | ---: |
| `13` | 40 | 4 |
| `15` | 4 | 4 |
| `17` | 4 | 5 |

Relative to the initial divider 40, dividers 4 and 5 represent 10× and 8×.
Instruction inspection additionally shows that both firmware versions flush their
software TX queue, then poll UART status **TxEMP (bit 3)** before writing the new
divider. This occurs after both `13` and `17`; the first test result does not change
speed. TxEMP indicates that the last stop bit has completed, unlike TxRDY, which
only reports room in the holding register. See the
[Motorola UART register definition, printed 11-25](https://sca.uwaterloo.ca/coldfire/ftp/mot/5206_s11.pdf#page=25).
Thus the firmware's intended physical boundary agrees with the Elektron manual.
The reverse-role probe also runs the instrument firmware as initiator: it emits
`16` at divider 4, retains divider 4 afterward, and switches to divider 5 only
after receiving `17`. Both endpoint roles therefore use SPEED1 for the second
test exchange.

The probe samples
firmware transmit-buffer (UTB) writes and later register state; **it does not
observe the final stop bit on a cable**. It injects bytes into the firmware receive
queue, and UART1 does not model baud mismatch.

A physical implementation must provide its own transmit-complete and TX/RX
baud-change boundaries. Successfully queuing `F7` is insufficient evidence that
it has left a physical UART. Likewise, `setBytePacing()` limits host admission;
it is not an instruction to change UART baud early.

## Timing, recovery, and input handling

| Category | Rule or behavior |
| --- | --- |
| Published negotiation timing | Timeouts apply per byte: master minimum 30 ms; slave minimum 15 ms and maximum 25 ms. |
| Published keepalive behavior | Send Active Sensing (`FE`) while using Turbo; TM-1's interval is approximately 150 ms. After receiving Active Sensing, a device returns to normal MIDI if it is lost for more than 300 ms. |
| Gearmulator response budget | Expire after more than one second in a reply-wait phase. Start after final-byte admission, without waiting for backend queue drain. Partial replies do not restart the timer; a complete expected reply takes precedence over expiry in the same service call. |
| Gearmulator keepalive | Admit `FE` every 150 ms of emulated Turbo time, ahead of other bytes. Incoming realtime bytes are ignored; there is no peer keepalive-loss timer. |
| Gearmulator fallback | Capability/acknowledgement failures begin payload at 1× immediately. Link-test failures stop Turbo keepalives and wait 350 ms before beginning payload at 1×. |
| Firmware compatibility | Wait 10 ms after observing `17` before admitting payload, as described above. |
| Emulator scheduling | Time and pacing advance in emulated cycles only after pre-transfer MIDI ingress drains. A blocked sink retains byte credit. |

The published timing requirements are in
[Appendix C, printed C-6](https://www.elektron.se/wp-content/uploads/2024/09/machinedrum_manual_OS1.63.pdf#page=120).
The sender's phase budget does not implement those per-byte deadlines.

For replies, Gearmulator recognizes the generic prefix, strips realtime bytes,
and discards unrelated queued commands while searching for the expected reply.
It checks the minimum capability-report length and first-test echo, while retaining
tolerance for extra trailing response data. Oversized messages are dropped until a
new `F0`. These are input tolerances; an external sender should emit the canonical
frames above.

`MidiByteSink::queuedMidiByteCount()` reports pending **firmware receive bytes**
in the current backend. Payload completion and cancellation retain ownership until
those pending bytes drain. That condition is distinct from physical transmission
completion on an external serial adapter.

## Capability mapping and retained sender discrepancy

Combine each two-byte capability field as `low | (high << 7)`. **Bit n denotes
speed code n + 2**, not n + 1. Original MD 1.63 and MM 1.32b firmware both interpret
isolated capability reports this way, agreeing with the manual's lowest-bit
meaning. The second byte starts at bit 7, corresponding to code 9 (13.33×).

The firmware probe places each instrument in its initiator report-wait state,
sets preferred code 9, and supplies one supported/certified bit at a time through
the original MIDI parser. This setup writes version-specific firmware state and
bypasses the UI; it does not patch firmware instructions or use Gearmulator's
selector. Both firmware versions emit these independently recorded results:

| Supported and certified bytes (each pair) | Capability bit | Firmware requests SPEED1 / SPEED2 |
| --- | ---: | --- |
| `01 00` | 0 | 2 / 2 |
| `02 00` | 1 | 3 / 3 |
| `04 00` | 2 | 4 / 4 |
| `08 00` | 3 | 5 / 5 |
| `10 00` | 4 | 6 / 5 |
| `20 00` | 5 | 7 / 6 |
| `40 00` | 6 | 8 / 7 |
| `00 01` | 7 | 9 / 8 |
| `00 02` or `00 04` | 8 or 9 | 1 / 1 (fallback) |

The first requested code establishes the supported-bit mapping. The second also
reflects firmware selection policy: above its certified limit, it can choose a
lower transfer code absent from the supplied mask. Do not copy that choice as a
requirement on all initiators. Separate responder tests accept equal-speed pairs
2/2 through 5/5, reject equal pairs 6/6 through 9/9, and accept first-test codes
2–9 with transfer code 2. All cases start from a verified standard-speed reset.

**Gearmulator retains an off-by-one capability decoder in this refactor.** It
maps bit n to code n + 1, so `01 00 01 00` falls back to standard MIDI although
firmware requests 2/2. Its synthetic transcript tests preserve existing behavior;
the independent firmware vectors establish the different wire interpretation.
For the instrument's broad report, the current sender still chooses the accepted
8/7 pair shown above. Correcting selection, including handling code 9 beyond the
current pacing table, requires a separate behavior change.

[MCL at commit 312e9b44](https://github.com/jmamma/MCL/blob/312e9b44dd988cfa9597f156decd81b7cc3e24c1/avr/cores/megacommand/Midi/TurboMidi.cpp)
also uses highest-bit plus one. That historical agreement does not override the
original firmware evidence.

## Code and validation entry points

- [Wire definitions](../source/elektron/md/mdLib/mdturbomidiprotocol.h): commands,
  directions, lengths, offsets, pattern and rate labels.
- [Sender policy](../source/elektron/md/mdLib/mdturbomidisenderpolicy.h): capability
  interpretation, selection heuristic and timing choices.
- [Negotiation implementation](../source/elektron/md/mdLib/mdturbomidi.cpp):
  `serviceNegotiation()` and `setBytePacing()`.
- [Transcript tests](../source/elektron/md/mdLibTest/turboMidiTest.cpp): independent
  expected bytes, synthetic sparse/lowest-bit vectors, pacing and timeout boundaries.

The core/audio CTest selections run the transport tests and compile the firmware
probe. **The firmware probe is a manual executable, not an automatically executed
CTest.** With a configured core build and locally supplied fixtures, run:

```sh
cmake --build build --config Release --target mdTurboMidiFirmwareTest
# Use the executable location produced by your build generator:
/path/to/mdTurboMidiFirmwareTest md /path/to/MD-1.63-ROM /path/to/factory-cache
/path/to/mdTurboMidiFirmwareTest mm /path/to/MM-1.32b-ROM /path/to/1MiB-patch-RAM
```

The probe has been run successfully with MD 1.63 and MM 1.32b under normal DSP MMU
mappings. Transport tests verify sender behavior; firmware probes verify the stated
firmware observations. Physical UART interoperability remains a separate validation
step.
