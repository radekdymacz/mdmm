/* The editors' webkit2gtk shim on Linux (doc/release/LINUX.md, mdmmLinuxWebView.cmake).
 *
 * JUCE 7 opens "libwebkit2gtk-4.0.so" with dlopen and looks up sixteen functions in it. That name is the
 * development symlink of webkit2gtk-4.0, which current distributions no longer ship at all (Ubuntu 24.04 and
 * Debian 13 have only webkit2gtk-4.1, whose C API is the same; 4.1 only moved to libsoup 3). This file is
 * built as a library of that name, put beside the standalone and the VST3 module (both have $ORIGIN in their
 * run path, which dlopen searches for the calling object): it opens whichever webkit2gtk is installed, 4.0 or
 * 4.1, and forwards the sixteen functions to it. The optional mdmm_webkit_runtime_error entry point lets our
 * JUCE browser distinguish a usable shim from one whose underlying runtime could not load.
 *
 * Only the functions JUCE 7.0.10's juce_WebBrowserComponent_linux.cpp binds; a JUCE that binds more fails its
 * own symbol lookup (an empty editor), so a JUCE update must check this list.
 */
#include <dlfcn.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

#define MDMM_EXPORT __attribute__((visibility("default")))

static void* g_webkit;
static char g_error[4096];

MDMM_EXPORT const char* mdmm_webkit_runtime_error(void)
{
	return g_webkit ? NULL : g_error;
}

static void* lookup(const char* _name)
{
	return g_webkit ? dlsym(g_webkit, _name) : NULL;
}

__attribute__((constructor)) static void mdmmWebkitShimOpen(void)
{
	static const char* const names[] = { "libwebkit2gtk-4.0.so.37", "libwebkit2gtk-4.1.so.0" };
	snprintf(g_error, sizeof(g_error), "Could not load a WebKitGTK runtime. ");
	for(size_t i = 0; i < sizeof(names) / sizeof(names[0]) && !g_webkit; ++i)
	{
		g_webkit = dlopen(names[i], RTLD_NOW | RTLD_GLOBAL);
		if(!g_webkit)
		{
			const char* error = dlerror();
			const size_t used = strlen(g_error);
			snprintf(g_error + used, sizeof(g_error) - used, "%s: %s; ", names[i], error ? error : "unknown error");
		}
		else
			fprintf(stderr, "MD/MM WebKitGTK runtime: %s\n", names[i]);
	}
	if(!g_webkit)
		fprintf(stderr, "MD/MM WebKitGTK: %s\n", g_error);
}

/* One forwarder: resolved on its first call, then called directly. */
#define MDMM_FORWARD(_ret, _name, _params, _args, _fallback) \
	MDMM_EXPORT _ret _name _params \
	{ \
		static _ret (*fn) _params; \
		if(!fn) \
			fn = (_ret (*) _params)lookup(#_name); \
		if(!fn) \
			return _fallback; \
		return fn _args; \
	}

#define MDMM_FORWARD_VOID(_name, _params, _args) \
	MDMM_EXPORT void _name _params \
	{ \
		static void (*fn) _params; \
		if(!fn) \
			fn = (void (*) _params)lookup(#_name); \
		if(fn) \
			fn _args; \
	}

MDMM_FORWARD(void*, webkit_settings_new, (void), (), NULL)
MDMM_FORWARD_VOID(webkit_settings_set_hardware_acceleration_policy, (void* _s, int _p), (_s, _p))
MDMM_FORWARD_VOID(webkit_settings_set_user_agent, (void* _s, const char* _a), (_s, _a))
MDMM_FORWARD(void*, webkit_web_view_new_with_settings, (void* _s), (_s), NULL)
MDMM_FORWARD_VOID(webkit_policy_decision_use, (void* _d), (_d))
MDMM_FORWARD_VOID(webkit_policy_decision_ignore, (void* _d), (_d))
MDMM_FORWARD_VOID(webkit_web_view_go_back, (void* _v), (_v))
MDMM_FORWARD_VOID(webkit_web_view_go_forward, (void* _v), (_v))
MDMM_FORWARD_VOID(webkit_web_view_reload, (void* _v), (_v))
MDMM_FORWARD_VOID(webkit_web_view_stop_loading, (void* _v), (_v))
MDMM_FORWARD(const char*, webkit_uri_request_get_uri, (void* _r), (_r), NULL)
MDMM_FORWARD_VOID(webkit_web_view_load_uri, (void* _v, const char* _uri), (_v, _uri))
MDMM_FORWARD(void*, webkit_navigation_action_get_request, (void* _a), (_a), NULL)
MDMM_FORWARD(const char*, webkit_navigation_policy_decision_get_frame_name, (void* _d), (_d), NULL)
MDMM_FORWARD(void*, webkit_navigation_policy_decision_get_navigation_action, (void* _d), (_d), NULL)
MDMM_FORWARD(const char*, webkit_web_view_get_uri, (void* _v), (_v), NULL)
