/*
  ==============================================================================

   This file is part of the JUCE library.
   Copyright (c) 2022 - Raw Material Software Limited

   JUCE is an open source library subject to commercial or open-source
   licensing.

   By using JUCE, you agree to the terms of both the JUCE 7 End-User License
   Agreement and JUCE Privacy Policy.

   End User License Agreement: www.juce.com/juce-7-licence
   Privacy Policy: www.juce.com/juce-privacy-policy

   Or: You may also use this code under the terms of the GPL v3 (see
   www.gnu.org/licenses).

   JUCE IS PROVIDED "AS IS" WITHOUT ANY WARRANTY, AND ALL WARRANTIES, WHETHER
   EXPRESSED OR IMPLIED, INCLUDING MERCHANTABILITY AND FITNESS FOR PURPOSE, ARE
   DISCLAIMED.

  ==============================================================================
*/

#include <dlfcn.h>
#include <cstdio>

int main (int argc, const char* const* argv)
{
    if (argc < 3)
    {
        std::fprintf (stderr, "WebKitGTK helper: missing module or entry point argument\n");
        return 1;
    }

    auto* handle = dlopen (argv[1], RTLD_LAZY);
    if (handle == nullptr)
    {
        std::fprintf (stderr, "WebKitGTK helper: could not load %s: %s\n", argv[1], dlerror());
        return 1;
    }

    auto* function = reinterpret_cast<int (*) (int, const char* const*)> (dlsym (handle, argv[2]));
    if (function == nullptr)
    {
        std::fprintf (stderr, "WebKitGTK helper: could not find %s: %s\n", argv[2], dlerror());
        return 1;
    }
    return function (argc - 3, argv + 3);
}
