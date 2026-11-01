# Third-party notices

The Machinedrum Editor and the Monomachine Editor are free software under the GNU General Public License,
version 3 (`LICENSE.md`). They contain the third-party code, fonts and data listed here, each used under the
licence named for it; every one of these licences is compatible with GPL-3. Each licence text is given once, in
"Licence texts" at the end. Where a component carries its own licence file in the source tree, that file is named.
The source of this program, with every file named below, is at https://github.com/radekdymacz/mdmm.

No Elektron firmware is shipped. You bring the ROM of the machine you own.

## Components

| Component | Version or origin | Licence | Copyright | Licence file in the source tree |
|---|---|---|---|---|
| JUCE | 7.0.10, from joelanders/JUCE-md-mm at `f96dadf41974b512ab0e2d13767c9b1902470dc7` (a fork of juce-framework/JUCE) | GPL-3, used under the GPL option JUCE offers | Raw Material Software Limited | `source/JUCE/LICENSE.md` |
| RmlUi | 6.1, a plain folder (the UI library behind the plug-in's settings pages) | MIT | 2008-2014 CodePoint Ltd, Shift Technology Ltd, and contributors; 2019-2025 The RmlUi Team, and contributors | `source/3rdparty/RmlUi/LICENSE.txt` |
| robin_hood hashing (inside RmlUi) | as bundled in RmlUi | MIT | 2018-2020 Martin Ankerl | `source/3rdparty/RmlUi/Include/RmlUi/Core/Containers/LICENSE.txt` |
| FreeType | submodule pinned at `828916527ce4f69af722bce46ce54d289001a0bd`, unmodified (font engine behind RmlUi) | FreeType License (FTL), taken instead of the GPL-2 option | 1996-2002, 2006 David Turner, Robert Wilhelm, Werner Lemberg (The FreeType Project) | `docs/FTL.TXT` and `LICENSE.TXT` in the FreeType repository at the pinned commit |
| lunasvg | submodule pinned at `f8aabfb444bb37f69df7290790f57e4a27730a93`, unmodified (SVG for RmlUi) | MIT | 2020-2025 Samuel Ugochukwu | `LICENSE` in the lunasvg repository at the pinned commit |
| DSP56300 emulator | joelanders/dsp56300-md-mm at `1378c43074e6ec22f69f14ed55c21e44c5ccadc1` (a fork of dsp56300/dsp56300) | GPL-3 | The Usual Suspects and contributors | `source/dsp56300/LICENSE.md` |
| asmjit | dsp56300/asmjit at `3577608cab0bc509f856ebf6e41b2f9d9f71acc4` (a fork of asmjit/asmjit) | zlib | 2008-2020 The AsmJit Authors | `source/dsp56300/source/asmjit/LICENSE.md` |
| mc68k (ColdFire core and peripherals) | joelanders/mc68k-md-mm at `ace95b3d0a5a332db147244762dda65f9a010b9f` (a fork of dsp56300/mc68k) | GPL-3 | The Usual Suspects and contributors | `source/mc68k/LICENSE.md` |
| Musashi (the 68k core inside mc68k) | 4.10, https://github.com/kstenerud/Musashi | MIT | 1998-2001 Karl Stenerud | `source/mc68k/Musashi/readme.txt` |
| libresample | based on resample-1.7 by Julius Smith | BSD-2-Clause, chosen from the BSD or LGPL pair it is offered under | 2003 Dominic Mazzoni | `source/libresample/LICENSE-BSD.txt` |
| Lua | 5.4.7 | MIT | 1994-2024 Lua.org, PUC-Rio | the notice at the end of `source/3rdparty/lua/lua.h` |
| Monocypher | 4.0.2, unmodified | BSD-2-Clause or CC0-1.0, taken under CC0 | 2017-2023 Loup Vaillant; 2017-2019 Michael Savage; 2017-2023 Fabio Scotoni | `source/elektron/md/mdmmUpdate/monocypher/LICENCE.md` |
| IBM Plex Mono (page font) | Regular, Medium | SIL OFL 1.1 | 2017 IBM Corp. with Reserved Font Name "Plex" | `source/elektron/md/mdJucePlugin/skins/mdStudio/fonts/OFL-IBMPlexMono.txt` |
| Barlow Condensed (page font) | Medium, SemiBold | SIL OFL 1.1 | 2017 The Barlow Project Authors (https://github.com/jpt/barlow) | `source/elektron/md/mdJucePlugin/skins/mdStudio/fonts/OFL-BarlowCondensed.txt` |
| Silkscreen (page font) | Regular | SIL OFL 1.1 | 2001 The Silkscreen Project Authors (https://github.com/googlefonts/silkscreen) | `source/elektron/md/mdJucePlugin/skins/mdStudio/fonts/OFL-Silkscreen.txt` |
| Roboto (plug-in settings pages) | variable font, upright and italic | SIL OFL 1.1 | 2011 The Roboto Project Authors (https://github.com/googlefonts/roboto-classic) | `source/jucePluginData/` (the licence is named in the font file's own name table) |
| Microsoft WebView2 loader (Windows builds only) | linked into the Windows binaries | Microsoft's WebView2 licence | Microsoft Corporation | `WebView2-LICENSE.txt`, shipped in the Windows archive |

The macOS and Linux builds use the system's web view (WKWebView, WebKitGTK) and ship none of it.

Also in the source tree and not shipped in any package: the RmlUi samples, tests and debugger (including Lato, Noto
Emoji, Cairo, Poppins and Courier Prime fonts, with their licences in `source/3rdparty/RmlUi/Samples/assets/LICENSE.txt`
and `source/3rdparty/RmlUi/Source/Debugger/LICENSE.txt`), the Intel ITT notify code in `source/dsp56300/source/vtuneSdk`
(BSD or GPL; only for the optional VTune profiling build) and the HxD plug-in API in `source/dsp56300/source/HxDplugin`
(optional, off).

## Notes by component

**JUCE.** JUCE is dual-licensed: the commercial JUCE licence tiers, or the GNU General Public License version 3.
The editors are GPL-3 and publish their complete source, so JUCE is used under the GPL-3 option. The JUCE end-user
licence agreement and privacy policy named in `source/JUCE/LICENSE.md` apply to anyone who downloads JUCE itself.
JUCE bundles smaller libraries (under `modules/juce_audio_formats/codecs`, `modules/juce_graphics/image_formats` and
others) with licences of their own; their files carry the notices in `source/JUCE/modules`.

**FreeType.** Portions of this software are copyright (C) The FreeType Project (www.freetype.org). All rights
reserved. FreeType is taken under the FreeType License, a BSD-style licence with a credit clause (the sentence
above), which is compatible with GPL-3.

**libresample.** The library is offered under BSD and under LGPL. The editors take the BSD licence.

**The emulator and 68k folders.** The DSP56300 emulator, mc68k and the plug-in framework code under `source/` come
from the open-source Gearmulator project by The Usual Suspects (https://github.com/dsp56300/gearmulator) and from
joelanders' Machinedrum and Monomachine emulation (https://github.com/joelanders/gearmulator-md-mm). Their original
README is kept in the source tree as `README.upstream.md`.

**Machinedrum, Monomachine and Elektron** are trademarks of Elektron Music Machines MAV AB. This project is not
affiliated with or endorsed by Elektron.

## Licence texts

### GNU General Public License, version 3 (JUCE, the DSP56300 emulator, mc68k, and this program)

The full text is in `LICENSE.md`, beside this file in every package and at the root of the source tree. It is not
repeated here.

### MIT licence (RmlUi, robin_hood, lunasvg, Musashi, Lua)

Each component's copyright line is in the table; the terms are these.

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### zlib licence (asmjit)

Copyright (c) 2008-2020 The AsmJit Authors

```
Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
   claim that you wrote the original software. If you use this software
   in a product, an acknowledgment in the product documentation would be
   appreciated but is not required.
2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.
3. This notice may not be removed or altered from any source distribution.
```

### BSD 2-clause licence (libresample)

Copyright (c) 2003, Dominic Mazzoni. All rights reserved.

```
Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice, this
  list of conditions and the following disclaimer in the documentation and/or
  other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### CC0 1.0 Universal (Monocypher)

Monocypher is dedicated to the public domain under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/),
with a 2-clause BSD licence as the alternative. The text of both, with the copyright lines, is in
`source/elektron/md/mdmmUpdate/monocypher/LICENCE.md`.

### FreeType License (FreeType)

The text of `docs/FTL.TXT` at the pinned commit. FreeType is taken under this licence, not the GPL-2 option.

```
The FreeType Project LICENSE
                    ----------------------------

                            2006-Jan-27

                    Copyright 1996-2002, 2006 by
          David Turner, Robert Wilhelm, and Werner Lemberg



Introduction
============

  The FreeType  Project is distributed in  several archive packages;
  some of them may contain, in addition to the FreeType font engine,
  various tools and  contributions which rely on, or  relate to, the
  FreeType Project.

  This  license applies  to all  files found  in such  packages, and
  which do not  fall under their own explicit  license.  The license
  affects  thus  the  FreeType   font  engine,  the  test  programs,
  documentation and makefiles, at the very least.

  This  license   was  inspired  by  the  BSD,   Artistic,  and  IJG
  (Independent JPEG  Group) licenses, which  all encourage inclusion
  and  use of  free  software in  commercial  and freeware  products
  alike.  As a consequence, its main points are that:

    o We don't promise that this software works. However, we will be
      interested in any kind of bug reports. (`as is' distribution)

    o You can  use this software for whatever you  want, in parts or
      full form, without having to pay us. (`royalty-free' usage)

    o You may not pretend that  you wrote this software.  If you use
      it, or  only parts of it,  in a program,  you must acknowledge
      somewhere  in  your  documentation  that  you  have  used  the
      FreeType code. (`credits')

  We  specifically  permit  and  encourage  the  inclusion  of  this
  software, with  or without modifications,  in commercial products.
  We  disclaim  all warranties  covering  The  FreeType Project  and
  assume no liability related to The FreeType Project.


  Finally,  many  people  asked  us  for  a  preferred  form  for  a
  credit/disclaimer to use in compliance with this license.  We thus
  encourage you to use the following text:

   """
    Portions of this software are copyright © <year> The FreeType
    Project (www.freetype.org).  All rights reserved.
   """

  Please replace <year> with the value from the FreeType version you
  actually use.


Legal Terms
===========

0. Definitions
--------------

  Throughout this license,  the terms `package', `FreeType Project',
  and  `FreeType  archive' refer  to  the  set  of files  originally
  distributed  by the  authors  (David Turner,  Robert Wilhelm,  and
  Werner Lemberg) as the `FreeType Project', be they named as alpha,
  beta or final release.

  `You' refers to  the licensee, or person using  the project, where
  `using' is a generic term including compiling the project's source
  code as  well as linking it  to form a  `program' or `executable'.
  This  program is  referred to  as  `a program  using the  FreeType
  engine'.

  This  license applies  to all  files distributed  in  the original
  FreeType  Project,   including  all  source   code,  binaries  and
  documentation,  unless  otherwise  stated   in  the  file  in  its
  original, unmodified form as  distributed in the original archive.
  If you are  unsure whether or not a particular  file is covered by
  this license, you must contact us to verify this.

  The FreeType  Project is copyright (C) 1996-2000  by David Turner,
  Robert Wilhelm, and Werner Lemberg.  All rights reserved except as
  specified below.

1. No Warranty
--------------

  THE FREETYPE PROJECT  IS PROVIDED `AS IS' WITHOUT  WARRANTY OF ANY
  KIND, EITHER  EXPRESS OR IMPLIED,  INCLUDING, BUT NOT  LIMITED TO,
  WARRANTIES  OF  MERCHANTABILITY   AND  FITNESS  FOR  A  PARTICULAR
  PURPOSE.  IN NO EVENT WILL ANY OF THE AUTHORS OR COPYRIGHT HOLDERS
  BE LIABLE  FOR ANY DAMAGES CAUSED  BY THE USE OR  THE INABILITY TO
  USE, OF THE FREETYPE PROJECT.

2. Redistribution
-----------------

  This  license  grants  a  worldwide, royalty-free,  perpetual  and
  irrevocable right  and license to use,  execute, perform, compile,
  display,  copy,   create  derivative  works   of,  distribute  and
  sublicense the  FreeType Project (in  both source and  object code
  forms)  and  derivative works  thereof  for  any  purpose; and  to
  authorize others  to exercise  some or all  of the  rights granted
  herein, subject to the following conditions:

    o Redistribution of  source code  must retain this  license file
      (`FTL.TXT') unaltered; any  additions, deletions or changes to
      the original  files must be clearly  indicated in accompanying
      documentation.   The  copyright   notices  of  the  unaltered,
      original  files must  be  preserved in  all  copies of  source
      files.

    o Redistribution in binary form must provide a  disclaimer  that
      states  that  the software is based in part of the work of the
      FreeType Team,  in  the  distribution  documentation.  We also
      encourage you to put an URL to the FreeType web page  in  your
      documentation, though this isn't mandatory.

  These conditions  apply to any  software derived from or  based on
  the FreeType Project,  not just the unmodified files.   If you use
  our work, you  must acknowledge us.  However, no  fee need be paid
  to us.

3. Advertising
--------------

  Neither the  FreeType authors and  contributors nor you  shall use
  the name of the  other for commercial, advertising, or promotional
  purposes without specific prior written permission.

  We suggest,  but do not require, that  you use one or  more of the
  following phrases to refer  to this software in your documentation
  or advertising  materials: `FreeType Project',  `FreeType Engine',
  `FreeType library', or `FreeType Distribution'.

  As  you have  not signed  this license,  you are  not  required to
  accept  it.   However,  as  the FreeType  Project  is  copyrighted
  material, only  this license, or  another one contracted  with the
  authors, grants you  the right to use, distribute,  and modify it.
  Therefore,  by  using,  distributing,  or modifying  the  FreeType
  Project, you indicate that you understand and accept all the terms
  of this license.

4. Contacts
-----------

  There are two mailing lists related to FreeType:

    o freetype@nongnu.org

      Discusses general use and applications of FreeType, as well as
      future and  wanted additions to the  library and distribution.
      If  you are looking  for support,  start in  this list  if you
      haven't found anything to help you in the documentation.

    o freetype-devel@nongnu.org

      Discusses bugs,  as well  as engine internals,  design issues,
      specific licenses, porting, etc.

  Our home page can be found at

    https://www.freetype.org


--- end of FTL.TXT ---
```

### SIL Open Font License 1.1 (the fonts)

The copyright lines of the four families are in the table.

```
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded, 
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

