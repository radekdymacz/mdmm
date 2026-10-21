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

namespace juce
{

//==============================================================================
class WebKitSymbols final : public DeletedAtShutdown
{
public:
    //==============================================================================
    bool isWebKitAvailable() const noexcept  { return webKitIsAvailable; }
    const String& getLoadError() const noexcept { return loadError; }

    //==============================================================================
    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (webkit_settings_new, juce_webkit_settings_new,
                                         (), WebKitSettings*)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (webkit_settings_set_hardware_acceleration_policy, juce_webkit_settings_set_hardware_acceleration_policy,
                                         (WebKitSettings*, int), void)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (webkit_settings_set_user_agent, juce_webkit_settings_set_user_agent,
                                         (WebKitSettings*, const gchar*), void)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (webkit_web_view_new_with_settings, juce_webkit_web_view_new_with_settings,
                                         (WebKitSettings*), GtkWidget*)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (webkit_web_view_load_uri, juce_webkit_web_view_load_uri,
                                         (WebKitWebView*, const gchar*), void)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (webkit_policy_decision_use, juce_webkit_policy_decision_use,
                                         (WebKitPolicyDecision*), void)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (webkit_policy_decision_ignore, juce_webkit_policy_decision_ignore,
                                         (WebKitPolicyDecision*), void)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (webkit_web_view_go_back, juce_webkit_web_view_go_back,
                                         (WebKitWebView*), void)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (webkit_web_view_go_forward, juce_webkit_web_view_go_forward,
                                         (WebKitWebView*), void)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (webkit_web_view_reload, juce_webkit_web_view_reload,
                                         (WebKitWebView*), void)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (webkit_web_view_stop_loading, juce_webkit_web_view_stop_loading,
                                         (WebKitWebView*), void)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (webkit_uri_request_get_uri, juce_webkit_uri_request_get_uri,
                                         (WebKitURIRequest*), const gchar*)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (webkit_navigation_action_get_request, juce_webkit_navigation_action_get_request,
                                         (WebKitNavigationAction*), WebKitURIRequest*)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (webkit_navigation_policy_decision_get_frame_name, juce_webkit_navigation_policy_decision_get_frame_name,
                                         (WebKitNavigationPolicyDecision*), const gchar*)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (webkit_navigation_policy_decision_get_navigation_action, juce_webkit_navigation_policy_decision_get_navigation_action,
                                         (WebKitNavigationPolicyDecision*), WebKitNavigationAction*)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (webkit_web_view_get_uri, juce_webkit_web_view_get_uri,
                                         (WebKitWebView*), const gchar*)

    //==============================================================================
    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (gtk_init, juce_gtk_init,
                                         (int*, char***), void)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (gtk_plug_new, juce_gtk_plug_new,
                                         (::Window), GtkWidget*)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (gtk_scrolled_window_new, juce_gtk_scrolled_window_new,
                                         (GtkAdjustment*, GtkAdjustment*), GtkWidget*)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (gtk_container_add, juce_gtk_container_add,
                                         (GtkContainer*, GtkWidget*), void)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (gtk_widget_show_all, juce_gtk_widget_show_all,
                                         (GtkWidget*), void)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (gtk_plug_get_id, juce_gtk_plug_get_id,
                                         (GtkPlug*), ::Window)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (gtk_main, juce_gtk_main,
                                         (), void)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (gtk_main_quit, juce_gtk_main_quit,
                                         (), void)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (g_unix_fd_add, juce_g_unix_fd_add,
                                         (gint, GIOCondition, GUnixFDSourceFunc, gpointer), guint)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (g_object_ref, juce_g_object_ref,
                                         (gpointer), gpointer)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (g_object_unref, juce_g_object_unref,
                                         (gpointer), void)

    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (g_signal_connect_data, juce_g_signal_connect_data,
                                         (gpointer, const gchar*, GCallback, gpointer, GClosureNotify, GConnectFlags), gulong)

    //==============================================================================
    JUCE_GENERATE_FUNCTION_WITH_DEFAULT (gdk_set_allowed_backends, juce_gdk_set_allowed_backends,
                                         (const char*), void)

    //==============================================================================
    JUCE_DECLARE_SINGLETON_SINGLETHREADED_MINIMAL (WebKitSymbols)

private:
    WebKitSymbols()
    {
        if (! gtkLib.open ("libgtk-3.so"))
        {
            loadError = "Could not load libgtk-3.so (GTK 3): " + String (dlerror());
            return;
        }

        if (! webkitLib.open ("libwebkit2gtk-4.0.so"))
        {
            loadError = "Could not load libwebkit2gtk-4.0.so (WebKitGTK): " + String (dlerror());
            return;
        }

        // Our packaged shim exports the forwarders even if no runtime could be loaded.
        // Do not mistake those for a usable WebKit and pass null objects into GTK in the child.
        if (auto* check = reinterpret_cast<const char* (*)()> (webkitLib.getFunction ("mdmm_webkit_runtime_error")))
        {
            if (const auto* error = check())
            {
                loadError = error;
                return;
            }
        }

        webKitIsAvailable = loadWebkitSymbols() && loadGtkSymbols();
    }

    ~WebKitSymbols()
    {
        clearSingletonInstance();
    }

    template <typename FuncPtr>
    struct SymbolBinding
    {
        FuncPtr& func;
        const char* name;
    };

    template <typename FuncPtr>
    SymbolBinding<FuncPtr> makeSymbolBinding (FuncPtr& func, const char* name)
    {
        return { func, name };
    }

    template <typename FuncPtr>
    bool loadSymbols (DynamicLibrary& lib, SymbolBinding<FuncPtr> binding)
    {
        if (auto* func = lib.getFunction (binding.name))
        {
            binding.func = reinterpret_cast<FuncPtr> (func);
            return true;
        }

        loadError = "The GTK/WebKitGTK runtime is missing the symbol " + String (binding.name);
        return false;
    }

    template <typename FuncPtr, typename... Args>
    bool loadSymbols (DynamicLibrary& lib, SymbolBinding<FuncPtr> binding, Args... args)
    {
        return loadSymbols (lib, binding) && loadSymbols (lib, args...);
    }

    //==============================================================================
    bool loadWebkitSymbols()
    {
        return loadSymbols (webkitLib,
                            makeSymbolBinding (juce_webkit_settings_new,                                     "webkit_settings_new"),
                            makeSymbolBinding (juce_webkit_settings_set_hardware_acceleration_policy,        "webkit_settings_set_hardware_acceleration_policy"),
                            makeSymbolBinding (juce_webkit_settings_set_user_agent,                          "webkit_settings_set_user_agent"),
                            makeSymbolBinding (juce_webkit_web_view_new_with_settings,                       "webkit_web_view_new_with_settings"),
                            makeSymbolBinding (juce_webkit_policy_decision_use,                              "webkit_policy_decision_use"),
                            makeSymbolBinding (juce_webkit_policy_decision_ignore,                           "webkit_policy_decision_ignore"),
                            makeSymbolBinding (juce_webkit_web_view_go_back,                                 "webkit_web_view_go_back"),
                            makeSymbolBinding (juce_webkit_web_view_go_forward,                              "webkit_web_view_go_forward"),
                            makeSymbolBinding (juce_webkit_web_view_reload,                                  "webkit_web_view_reload"),
                            makeSymbolBinding (juce_webkit_web_view_stop_loading,                            "webkit_web_view_stop_loading"),
                            makeSymbolBinding (juce_webkit_uri_request_get_uri,                              "webkit_uri_request_get_uri"),
                            makeSymbolBinding (juce_webkit_web_view_load_uri,                                "webkit_web_view_load_uri"),
                            makeSymbolBinding (juce_webkit_navigation_action_get_request,                    "webkit_navigation_action_get_request"),
                            makeSymbolBinding (juce_webkit_navigation_policy_decision_get_frame_name,        "webkit_navigation_policy_decision_get_frame_name"),
                            makeSymbolBinding (juce_webkit_navigation_policy_decision_get_navigation_action, "webkit_navigation_policy_decision_get_navigation_action"),
                            makeSymbolBinding (juce_webkit_web_view_get_uri,                                 "webkit_web_view_get_uri"));
    }

    bool loadGtkSymbols()
    {
        return loadSymbols (gtkLib,
                            makeSymbolBinding (juce_gtk_init,                 "gtk_init"),
                            makeSymbolBinding (juce_gtk_plug_new,             "gtk_plug_new"),
                            makeSymbolBinding (juce_gtk_scrolled_window_new,  "gtk_scrolled_window_new"),
                            makeSymbolBinding (juce_gtk_container_add,        "gtk_container_add"),
                            makeSymbolBinding (juce_gtk_widget_show_all,      "gtk_widget_show_all"),
                            makeSymbolBinding (juce_gtk_plug_get_id,          "gtk_plug_get_id"),
                            makeSymbolBinding (juce_gtk_main,                 "gtk_main"),
                            makeSymbolBinding (juce_gtk_main_quit,            "gtk_main_quit"),
                            makeSymbolBinding (juce_g_unix_fd_add,            "g_unix_fd_add"),
                            makeSymbolBinding (juce_g_object_ref,             "g_object_ref"),
                            makeSymbolBinding (juce_g_object_unref,           "g_object_unref"),
                            makeSymbolBinding (juce_g_signal_connect_data,    "g_signal_connect_data"),
                            makeSymbolBinding (juce_gdk_set_allowed_backends, "gdk_set_allowed_backends"));
    }

    //==============================================================================
    DynamicLibrary gtkLib, webkitLib;
    String loadError;
    bool webKitIsAvailable = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (WebKitSymbols)
};

JUCE_IMPLEMENT_SINGLETON (WebKitSymbols)

//==============================================================================
extern "C" int juce_gtkWebkitMain (int argc, const char* const* argv);

class CommandReceiver
{
public:
    struct Responder
    {
        virtual ~Responder() {}

        virtual void handleCommand (const String& cmd, const var& param) = 0;
        virtual void receiverHadError() = 0;
    };

    CommandReceiver (Responder* responderToUse, int inputChannelToUse)
        : responder (responderToUse), inChannel (inputChannelToUse)
    {
        setBlocking (inChannel, false);
    }

    static void setBlocking (int fd, bool shouldBlock)
    {
        auto flags = fcntl (fd, F_GETFL);
        fcntl (fd, F_SETFL, (shouldBlock ? (flags & ~O_NONBLOCK)
                                         : (flags | O_NONBLOCK)));
    }

    int getFd() const     { return inChannel; }

    void tryNextRead()
    {
        for (;;)
        {
            auto len = (receivingLength ? sizeof (size_t) : bufferLength.len);

            if (! receivingLength)
                buffer.realloc (len);

            auto* dst = (receivingLength ? bufferLength.data : buffer.getData());

            auto actual = read (inChannel, &dst[pos], static_cast<size_t> (len - pos));

            if (actual < 0)
            {
                if (errno == EINTR)
                    continue;

                break;
            }

            if (actual == 0)
            {
                // EOF is permanent. Retrying it spins this thread forever and prevents the host
                // from closing an editor whose GTK helper exited (B-172).
                if (responder != nullptr)
                    responder->receiverHadError();
                return;
            }

            pos += static_cast<size_t> (actual);

            if (pos == len)
            {
                pos = 0;

                if (! receivingLength)
                    parseJSON (String (buffer.getData(), bufferLength.len));

                receivingLength = (! receivingLength);
            }
        }

        if (errno != EAGAIN && errno != EWOULDBLOCK && responder != nullptr)
            responder->receiverHadError();
    }

    static void sendCommand (int outChannel, const String& cmd, const var& params, bool nonBlocking = false)
    {
        DynamicObject::Ptr obj = new DynamicObject;

        obj->setProperty (getCmdIdentifier(), cmd);

        if (! params.isVoid())
            obj->setProperty (getParamIdentifier(), params);

        auto json = JSON::toString (var (obj.get()));

        auto jsonLength = static_cast<size_t> (json.length());
        auto len        = sizeof (size_t) + jsonLength;

        HeapBlock<char> buffer (len);
        auto* dst = buffer.getData();

        memcpy (dst, &jsonLength, sizeof (size_t));
        dst += sizeof (size_t);

        memcpy (dst, json.toRawUTF8(), jsonLength);

        // These channels are local sockets. A child may exit between any two commands;
        // MSG_NOSIGNAL prevents that from delivering SIGPIPE to the plug-in's host.
        size_t sent = 0;
        while (sent < len)
        {
            const auto ret = send (outChannel, buffer.getData() + sent, len - sent,
                                   MSG_NOSIGNAL | (nonBlocking ? MSG_DONTWAIT : 0));
            if (ret > 0)
                sent += static_cast<size_t> (ret);
            else if (ret == 0 || errno != EINTR)
                break;
        }
    }

private:
    void parseJSON (const String& json)
    {
        auto object = JSON::fromString (json);

        if (! object.isVoid())
        {
            auto cmd    = object.getProperty (getCmdIdentifier(),   {}).toString();
            auto params = object.getProperty (getParamIdentifier(), {});

            if (responder != nullptr)
                responder->handleCommand (cmd, params);
        }
    }

    static Identifier getCmdIdentifier()    { static Identifier Id ("cmd");    return Id; }
    static Identifier getParamIdentifier()  { static Identifier Id ("params"); return Id; }

    Responder* responder = nullptr;
    int inChannel = 0;
    size_t pos = 0;
    bool receivingLength = true;
    union { char data [sizeof (size_t)]; size_t len; } bufferLength;
    HeapBlock<char> buffer;
};

#define juce_g_signal_connect(instance, detailed_signal, c_handler, data) \
    WebKitSymbols::getInstance()->juce_g_signal_connect_data (instance, detailed_signal, c_handler, data, nullptr, (GConnectFlags) 0)

//==============================================================================
class GtkChildProcess final : private CommandReceiver::Responder
{
public:
    //==============================================================================
    GtkChildProcess (int inChannel, int outChannelToUse, const String& userAgentToUse)
        : outChannel (outChannelToUse),
          receiver (this, inChannel),
          userAgent (userAgentToUse)
    {}

    int entry()
    {
        CommandReceiver::setBlocking (outChannel, true);
        fcntl (outChannel, F_SETFD, FD_CLOEXEC);
        fcntl (receiver.getFd(), F_SETFD, FD_CLOEXEC);
        if (! WebKitSymbols::getInstance()->isWebKitAvailable())
        {
            std::fprintf (stderr, "WebKitGTK helper: %s\n", WebKitSymbols::getInstance()->getLoadError().toRawUTF8());
            return 1;
        }

        // webkit2gtk crashes when using the wayland backend embedded into an x11 window
        WebKitSymbols::getInstance()->juce_gdk_set_allowed_backends ("x11");

        WebKitSymbols::getInstance()->juce_gtk_init (nullptr, nullptr);

        auto* settings = WebKitSymbols::getInstance()->juce_webkit_settings_new();
        WebKitSymbols::getInstance()->juce_webkit_settings_set_hardware_acceleration_policy (settings,
                                                                                             /* WEBKIT_HARDWARE_ACCELERATION_POLICY_NEVER */ 2);
        if (userAgent.isNotEmpty())
            WebKitSymbols::getInstance()->juce_webkit_settings_set_user_agent (settings, userAgent.toRawUTF8());

        auto* plug      = WebKitSymbols::getInstance()->juce_gtk_plug_new (0);
        auto* container = WebKitSymbols::getInstance()->juce_gtk_scrolled_window_new (nullptr, nullptr);

        auto* webviewWidget = WebKitSymbols::getInstance()->juce_webkit_web_view_new_with_settings (settings);
        webview = (WebKitWebView*) webviewWidget;

        WebKitSymbols::getInstance()->juce_gtk_container_add ((GtkContainer*) container, webviewWidget);
        WebKitSymbols::getInstance()->juce_gtk_container_add ((GtkContainer*) plug,      container);

        WebKitSymbols::getInstance()->juce_webkit_web_view_load_uri (webview, "about:blank");

        juce_g_signal_connect (webview, "decide-policy",
                               (GCallback) decidePolicyCallback, this);

        juce_g_signal_connect (webview, "load-changed",
                               (GCallback) loadChangedCallback, this);

        juce_g_signal_connect (webview, "load-failed",
                               (GCallback) loadFailedCallback, this);

        juce_g_signal_connect (webview, "web-process-terminated",
                               (GCallback) webProcessTerminatedCallback, this);

        WebKitSymbols::getInstance()->juce_gtk_widget_show_all (plug);
        auto wID = (unsigned long) WebKitSymbols::getInstance()->juce_gtk_plug_get_id ((GtkPlug*) plug);

        ssize_t ret;

        for (;;)
        {
            ret = write (outChannel, &wID, sizeof (wID));

            if (ret != -1 || errno != EINTR)
                break;
        }

        WebKitSymbols::getInstance()->juce_g_unix_fd_add (receiver.getFd(), G_IO_IN, pipeReadyStatic, this);
        receiver.tryNextRead();

        WebKitSymbols::getInstance()->juce_gtk_main();

        WebKitSymbols::getInstance()->deleteInstance();
        return 0;
    }

    void goToURL (const var& params)
    {
        static Identifier urlIdentifier ("url");
        auto url = params.getProperty (urlIdentifier, var()).toString();

        WebKitSymbols::getInstance()->juce_webkit_web_view_load_uri (webview, url.toRawUTF8());
    }

    void handleDecisionResponse (const var& params)
    {
        auto* decision = (WebKitPolicyDecision*) ((int64) params.getProperty ("decision_id", var (0)));
        bool allow = params.getProperty ("allow", var (false));

        if (decision != nullptr && decisions.contains (decision))
        {
            if (allow)
                WebKitSymbols::getInstance()->juce_webkit_policy_decision_use (decision);
            else
                WebKitSymbols::getInstance()->juce_webkit_policy_decision_ignore (decision);

            decisions.removeAllInstancesOf (decision);
            WebKitSymbols::getInstance()->juce_g_object_unref (decision);
        }
    }

    //==============================================================================
    void handleCommand (const String& cmd, const var& params) override
    {
        if      (cmd == "quit")      quit();
        else if (cmd == "goToURL")   goToURL (params);
        else if (cmd == "goBack")    WebKitSymbols::getInstance()->juce_webkit_web_view_go_back      (webview);
        else if (cmd == "goForward") WebKitSymbols::getInstance()->juce_webkit_web_view_go_forward   (webview);
        else if (cmd == "refresh")   WebKitSymbols::getInstance()->juce_webkit_web_view_reload       (webview);
        else if (cmd == "stop")      WebKitSymbols::getInstance()->juce_webkit_web_view_stop_loading (webview);
        else if (cmd == "decision")  handleDecisionResponse (params);
    }

    void receiverHadError() override
    {
        exit (-1);
    }

    //==============================================================================
    bool pipeReady (gint fd, GIOCondition)
    {
        if (fd == receiver.getFd())
        {
            receiver.tryNextRead();
            return true;
        }

        return false;
    }

    void quit()
    {
        WebKitSymbols::getInstance()->juce_gtk_main_quit();
    }

    String getURIStringForAction (WebKitNavigationAction* action)
    {
        auto* request = WebKitSymbols::getInstance()->juce_webkit_navigation_action_get_request (action);
        return WebKitSymbols::getInstance()->juce_webkit_uri_request_get_uri (request);
    }

    bool onNavigation (String frameName,
                       WebKitNavigationAction* action,
                       WebKitPolicyDecision* decision)
    {
        if (decision != nullptr && frameName.isEmpty())
        {
            WebKitSymbols::getInstance()->juce_g_object_ref (decision);
            decisions.add (decision);

            DynamicObject::Ptr params = new DynamicObject;

            params->setProperty ("url", getURIStringForAction (action));
            params->setProperty ("decision_id", (int64) decision);
            CommandReceiver::sendCommand (outChannel, "pageAboutToLoad", var (params.get()));

            return true;
        }

        return false;
    }

    bool onNewWindow (String /*frameName*/,
                      WebKitNavigationAction* action,
                      WebKitPolicyDecision* decision)
    {
        if (decision != nullptr)
        {
            DynamicObject::Ptr params = new DynamicObject;

            params->setProperty ("url", getURIStringForAction (action));
            CommandReceiver::sendCommand (outChannel, "newWindowAttemptingToLoad", var (params.get()));

            // never allow new windows
            WebKitSymbols::getInstance()->juce_webkit_policy_decision_ignore (decision);

            return true;
        }

        return false;
    }

    void onLoadChanged (WebKitLoadEvent loadEvent)
    {
        if (loadEvent == WEBKIT_LOAD_FINISHED)
        {
            DynamicObject::Ptr params = new DynamicObject;

            params->setProperty ("url", String (WebKitSymbols::getInstance()->juce_webkit_web_view_get_uri (webview)));
            CommandReceiver::sendCommand (outChannel, "pageFinishedLoading", var (params.get()));
        }
    }

    bool onDecidePolicy (WebKitPolicyDecision*    decision,
                         WebKitPolicyDecisionType decisionType)
    {
        switch (decisionType)
        {
        case WEBKIT_POLICY_DECISION_TYPE_NAVIGATION_ACTION:
            {
                auto* navigationDecision = (WebKitNavigationPolicyDecision*) decision;
                auto* frameName = WebKitSymbols::getInstance()->juce_webkit_navigation_policy_decision_get_frame_name (navigationDecision);

                return onNavigation (String (frameName != nullptr ? frameName : ""),
                                     WebKitSymbols::getInstance()->juce_webkit_navigation_policy_decision_get_navigation_action (navigationDecision),
                                     decision);
            }
            break;
        case WEBKIT_POLICY_DECISION_TYPE_NEW_WINDOW_ACTION:
            {
                auto* navigationDecision = (WebKitNavigationPolicyDecision*) decision;
                auto* frameName = WebKitSymbols::getInstance()->juce_webkit_navigation_policy_decision_get_frame_name (navigationDecision);

                return onNewWindow  (String (frameName != nullptr ? frameName : ""),
                                     WebKitSymbols::getInstance()->juce_webkit_navigation_policy_decision_get_navigation_action (navigationDecision),
                                     decision);
            }
            break;
        case WEBKIT_POLICY_DECISION_TYPE_RESPONSE:
            {
                [[maybe_unused]] auto* response = (WebKitNavigationPolicyDecision*) decision;

                // for now just always allow response requests
                WebKitSymbols::getInstance()->juce_webkit_policy_decision_use (decision);
                return true;
            }
            break;
        default:
            break;
        }

        return false;
    }

    void onLoadFailed (GError* error)
    {
        DynamicObject::Ptr params = new DynamicObject;

        params->setProperty ("error", String (error != nullptr ? error->message : "unknown error"));
        CommandReceiver::sendCommand (outChannel, "pageLoadHadNetworkError", var (params.get()));
    }

private:
    static gboolean pipeReadyStatic (gint fd, GIOCondition condition, gpointer user)
    {
        return (reinterpret_cast<GtkChildProcess*> (user)->pipeReady (fd, condition) ? TRUE : FALSE);
    }

    static gboolean decidePolicyCallback (WebKitWebView*,
                                          WebKitPolicyDecision*    decision,
                                          WebKitPolicyDecisionType decisionType,
                                          gpointer user)
    {
        auto& owner = *reinterpret_cast<GtkChildProcess*> (user);
        return (owner.onDecidePolicy (decision, decisionType) ? TRUE : FALSE);
    }

    static void loadChangedCallback (WebKitWebView*,
                                     WebKitLoadEvent loadEvent,
                                     gpointer        user)
    {
        auto& owner = *reinterpret_cast<GtkChildProcess*> (user);
        owner.onLoadChanged (loadEvent);
    }

    static void loadFailedCallback (WebKitWebView*,
                                    WebKitLoadEvent /*loadEvent*/,
                                    gchar*          /*failing_uri*/,
                                    GError*         error,
                                    gpointer        user)
    {
        auto& owner = *reinterpret_cast<GtkChildProcess*> (user);
        owner.onLoadFailed (error);
    }

    static void webProcessTerminatedCallback (WebKitWebView*, WebKitWebProcessTerminationReason reason, gpointer user)
    {
        auto& owner = *reinterpret_cast<GtkChildProcess*> (user);
        DynamicObject::Ptr params = new DynamicObject;
        params->setProperty ("error", "The WebKitGTK page process terminated (reason " + String ((int) reason)
                                      + "). Close and reopen the editor; keep its startup log and the host's terminal output.");
        CommandReceiver::sendCommand (owner.outChannel, "pageLoadHadNetworkError", var (params.get()));
    }

    int outChannel = 0;
    CommandReceiver receiver;
    String userAgent;
    WebKitWebView* webview = nullptr;
    Array<WebKitPolicyDecision*> decisions;
};

//==============================================================================
class WebBrowserComponent::Pimpl  : private Thread,
                                    private CommandReceiver::Responder
{
public:
    Pimpl (WebBrowserComponent& parent, const String& userAgentToUse)
        : Thread ("Webview"), owner (parent), userAgent (userAgentToUse)
    {
        webKitIsAvailable = WebKitSymbols::getInstance()->isWebKitAvailable();
    }

    ~Pimpl() override
    {
        quit();
    }

    //==============================================================================
    void init()
    {
        if (! webKitIsAvailable)
        {
            reportFailure (WebKitSymbols::getInstance()->getLoadError());
            return;
        }

        if (! launchChild())
            return;

        if (pipe (threadControl) != 0)
        {
            reportFailure ("Could not create the WebKitGTK control pipe: " + String (strerror (errno)));
            killChild();
            return;
        }

        fcntl (threadControl[0], F_SETFD, FD_CLOEXEC);
        fcntl (threadControl[1], F_SETFD, FD_CLOEXEC);
        CommandReceiver::setBlocking (inChannel,        true);
        CommandReceiver::setBlocking (outChannel,       true);
        CommandReceiver::setBlocking (threadControl[0], false);
        CommandReceiver::setBlocking (threadControl[1], true);

        // A helper that cannot initialise GTK must not leave the DAW blocked indefinitely.
        unsigned long windowHandle = 0;
        auto* destination = reinterpret_cast<char*> (&windowHandle);
        size_t received = 0;
        const auto deadline = Time::getMillisecondCounterHiRes() + 10000.0;
        while (received < sizeof (windowHandle))
        {
            const auto remaining = deadline - Time::getMillisecondCounterHiRes();
            if (remaining <= 0.0)
                break;
            pollfd startup { inChannel, POLLIN, 0 };
            const auto ready = poll (&startup, 1, jmax (1, (int) remaining));
            if (ready < 0 && errno == EINTR)
                continue;
            if (ready <= 0)
                break;
            const auto actual = read (inChannel, destination + received, sizeof (windowHandle) - received);
            if (actual < 0 && errno == EINTR)
                continue;
            if (actual <= 0)
                break;
            received += static_cast<size_t> (actual);
        }

        if (received != sizeof (windowHandle) || windowHandle == 0)
        {
            const auto detail = Time::getMillisecondCounterHiRes() >= deadline
                ? "The WebKitGTK helper did not create its X11 window within 10 seconds. "
                : "The WebKitGTK helper closed its startup channel before creating an X11 window. ";
            reportFailure (String (detail) + "Check GTK/WebKitGTK in the host's runtime, X11/XWayland, "
                                            "and the host's terminal output.");
            killChild();
            return;
        }

        receiver.reset (new CommandReceiver (this, inChannel));

        pfds.push_back ({ threadControl[0],  POLLIN, 0 });
        pfds.push_back ({ receiver->getFd(), POLLIN, 0 });

        startThread();

        xembed.reset (new XEmbedComponent (windowHandle));
        owner.addAndMakeVisible (xembed.get());
    }

    void quit()
    {
        if (isThreadRunning())
        {
            signalThreadShouldExit();

            char ignore = 0;
            ssize_t ret;

            for (;;)
            {
                ret = write (threadControl[1], &ignore, 1);

                if (ret != -1 || errno != EINTR)
                    break;
            }

            waitForThreadToExit (-1);
            receiver = nullptr;
        }

        if (childProcess > 0)
        {
            // A wedged child may no longer drain commands. Closing an editor must still reach killChild().
            CommandReceiver::sendCommand (outChannel, "quit", {}, true);
            killChild();
        }
        closeChannel (inChannel);
        closeChannel (outChannel);
        closeChannel (threadControl[0]);
        closeChannel (threadControl[1]);
    }

    //==============================================================================
    void goToURL (const String& url, const StringArray* headers, const MemoryBlock* postData)
    {
        if (! webKitIsAvailable)
            return;

        DynamicObject::Ptr params = new DynamicObject;

        params->setProperty ("url", url);

        if (headers != nullptr)
            params->setProperty ("headers", var (*headers));

        if (postData != nullptr)
            params->setProperty ("postData", var (*postData));

        CommandReceiver::sendCommand (outChannel, "goToURL", var (params.get()));
    }

    void goBack()      { if (webKitIsAvailable) CommandReceiver::sendCommand (outChannel, "goBack",    {}); }
    void goForward()   { if (webKitIsAvailable) CommandReceiver::sendCommand (outChannel, "goForward", {}); }
    void refresh()     { if (webKitIsAvailable) CommandReceiver::sendCommand (outChannel, "refresh",   {}); }
    void stop()        { if (webKitIsAvailable) CommandReceiver::sendCommand (outChannel, "stop",      {}); }

    void resized()
    {
        if (xembed != nullptr)
            xembed->setBounds (owner.getLocalBounds());
    }

    void checkWindowAssociation()
    {
        if (xembed == nullptr)
            return;

        // XEmbedComponent maps its native host window when attached to a peer, but does not
        // follow JUCE visibility. Detach it while hidden so it cannot cover a native failure
        // view with a blank or stale page. Keep the client alive for a later show/slow start.
        if (owner.isVisible())
        {
            if (xembed->getParentComponent() == nullptr)
                owner.addAndMakeVisible (xembed.get());
        }
        else
        {
            owner.removeChildComponent (xembed.get());
        }
    }

private:
    //==============================================================================
    static void closeChannel (int& channel)
    {
        if (channel >= 0)
            close (std::exchange (channel, -1));
    }

    void reportFailure (const String& message)
    {
        webKitIsAvailable = false;
        DynamicObject::Ptr params = new DynamicObject;
        params->setProperty ("error", message);
        // init() runs in WebBrowserComponent's constructor: the derived callbacks are not ready yet.
        handleCommand ("pageLoadHadNetworkError", var (params.get()));
    }

    void killChild()
    {
        xembed = nullptr;
        if (childProcess <= 0)
            return;

        const auto pid = std::exchange (childProcess, 0);
        const auto reaped = [pid]
        {
            int status = 0;
            int result;
            do { result = waitpid (pid, &status, WNOHANG); } while (result < 0 && errno == EINTR);
            return result == pid || (result < 0 && errno == ECHILD);
        };
        for (int i = 0; i < 15; ++i)
        {
            if (reaped())
                return;
            Thread::sleep (100);
        }
        kill (pid, SIGTERM);
        for (int i = 0; i < 10; ++i)
        {
            if (reaped())
                return;
            Thread::sleep (50);
        }
        // Termination by a signal is terminal too; WIFEXITED alone caused an endless wait here.
        kill (pid, SIGKILL);
        int status;
        while (waitpid (pid, &status, 0) < 0 && errno == EINTR) {}
    }

    bool launchChild()
    {
        int inPipe[2] { -1, -1 }, outPipe[2] { -1, -1 };
        if (socketpair (AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0, inPipe) != 0
            || socketpair (AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0, outPipe) != 0)
        {
            const auto error = String (strerror (errno));
            for (auto& fd : inPipe) closeChannel (fd);
            for (auto& fd : outPipe) closeChannel (fd);
            reportFailure ("Could not create WebKitGTK channels: " + error);
            return false;
        }
        const auto closePipes = [&]
        {
            for (auto& fd : inPipe) closeChannel (fd);
            for (auto& fd : outPipe) closeChannel (fd);
        };

        std::vector<String> arguments;

       #if JUCE_USE_EXTERNAL_TEMPORARY_SUBPROCESS
        if (! JUCEApplicationBase::isStandaloneApp())
        {
            subprocessFile.emplace ("_juce_linux_subprocess");

            const auto externalSubprocessAvailable = subprocessFile->getFile().replaceWithData (LinuxSubprocessHelperBinaryData::juce_linux_subprocess_helper,
                                                                                                LinuxSubprocessHelperBinaryData::juce_linux_subprocess_helperSize)
                                                     && subprocessFile->getFile().setExecutePermission (true);

            if (! externalSubprocessAvailable)
            {
                closePipes();
                reportFailure ("Could not write the WebKitGTK helper: " + subprocessFile->getFile().getFullPathName());
                return false;
            }

            /*  The external subprocess will load the .so specified as its first argument and execute
                the function specified by the second. The remaining arguments will be passed on to
                the function.
            */
            arguments.emplace_back (subprocessFile->getFile().getFullPathName());
            arguments.emplace_back (File::getSpecialLocation (File::currentExecutableFile).getFullPathName());
            arguments.emplace_back ("juce_gtkWebkitMain");
        }
       #endif

        arguments.emplace_back (File::getSpecialLocation (File::currentExecutableFile).getFullPathName());
        arguments.emplace_back ("--juce-gtkwebkitfork-child");
        arguments.emplace_back (outPipe[0]);
        arguments.emplace_back (inPipe [1]);

        if (userAgent.isNotEmpty())
            arguments.emplace_back (userAgent);

        std::vector<const char*> argv (arguments.size() + 1, nullptr);
        std::transform (arguments.begin(), arguments.end(), argv.begin(), [] (const auto& arg)
        {
            return arg.toRawUTF8();
        });

        // Nothing in the forked host may allocate or lock before exec. Build every argument and
        // decide the executable in the parent (including the unsupported plug-in configuration).
       #if ! JUCE_USE_EXTERNAL_TEMPORARY_SUBPROCESS
        if (! JUCEApplicationBase::isStandaloneApp())
        {
            closePipes();
            reportFailure ("This plug-in was built without the external WebKitGTK helper.");
            return false;
        }
       #endif
        const auto* executable = argv.front();
        auto* const argumentsForExec = const_cast<char* const*> (argv.data());
        auto pid = fork();
        if (pid < 0)
        {
            const auto error = String (strerror (errno));
            closePipes();
            reportFailure ("Could not start the WebKitGTK helper: " + error);
            return false;
        }

        if (pid == 0)
        {
            close (inPipe[0]);
            close (outPipe[1]);
            // Only this child's two endpoints survive exec, not another editor instance's channels.
            fcntl (inPipe[1], F_SETFD, 0);
            fcntl (outPipe[0], F_SETFD, 0);
            execv (executable, argumentsForExec);

            // exec failed: use only async-signal-safe functions in this fork of the host.
            constexpr char error[] = "WebKitGTK helper exec failed; check temporary directory execution permissions and the host runtime.\n";
            const auto ignored = write (STDERR_FILENO, error, sizeof (error) - 1);
            (void) ignored;
            _exit (127);
        }

        close (inPipe[1]);
        close (outPipe[0]);

        inChannel  = inPipe[0];
        outChannel = outPipe[1];

        childProcess = pid;
        return true;
    }

    void run() override
    {
        while (! threadShouldExit())
        {
            if (shouldExit())
                return;

            receiver->tryNextRead();
            if (threadShouldExit())
                return;

            int result = 0;

            while (result == 0 || (result < 0 && errno == EINTR))
                result = poll (&pfds.front(), static_cast<nfds_t> (pfds.size()), 10);

            if (result < 0)
                break;
        }
    }

    bool shouldExit()
    {
        char ignore;
        auto result = read (threadControl[0], &ignore, 1);

        return (result != -1 || (errno != EAGAIN && errno != EWOULDBLOCK));
    }

    //==============================================================================
    void handleCommandOnMessageThread (const String& cmd, const var& params)
    {
        auto url = params.getProperty ("url", var()).toString();

        if      (cmd == "pageAboutToLoad")           handlePageAboutToLoad (url, params);
        else if (cmd == "pageFinishedLoading")       owner.pageFinishedLoading (url);
        else if (cmd == "windowCloseRequest")        owner.windowCloseRequest();
        else if (cmd == "newWindowAttemptingToLoad") owner.newWindowAttemptingToLoad (url);
        else if (cmd == "pageLoadHadNetworkError")   handlePageLoadHadNetworkError (params);
    }

    void handlePageAboutToLoad (const String& url, const var& inputParams)
    {
        int64 decision_id = inputParams.getProperty ("decision_id", var (0));

        if (decision_id != 0)
        {
            DynamicObject::Ptr params = new DynamicObject;

            params->setProperty ("decision_id", decision_id);
            params->setProperty ("allow", owner.pageAboutToLoad (url));

            CommandReceiver::sendCommand (outChannel, "decision", var (params.get()));
        }
    }

    void handlePageLoadHadNetworkError (const var& params)
    {
        String error = params.getProperty ("error", "Unknown error");

        if (owner.pageLoadHadNetworkError (error))
            goToURL (String ("data:text/plain,") + error, nullptr, nullptr);
    }

    void handleCommand (const String& cmd, const var& params) override
    {
        MessageManager::callAsync ([liveness = std::weak_ptr (livenessProbe), this, cmd, params]
                                   {
                                       if (liveness.lock() != nullptr)
                                           handleCommandOnMessageThread (cmd, params);
                                   });
    }

    void receiverHadError() override
    {
        signalThreadShouldExit();
        DynamicObject::Ptr params = new DynamicObject;
        params->setProperty ("error", "The WebKitGTK helper disconnected. Close and reopen the editor; "
                                      "keep its startup log and the host's terminal output.");
        handleCommand ("pageLoadHadNetworkError", var (params.get()));
    }

    //==============================================================================
    bool webKitIsAvailable = false;

    WebBrowserComponent& owner;
    String userAgent;
    std::unique_ptr<CommandReceiver> receiver;
    int childProcess = 0, inChannel = -1, outChannel = -1;
    int threadControl[2] { -1, -1 };
    std::unique_ptr<XEmbedComponent> xembed;
    std::shared_ptr<int> livenessProbe = std::make_shared<int> (0);
    std::vector<pollfd> pfds;
    std::optional<TemporaryFile> subprocessFile;
};

//==============================================================================
WebBrowserComponent::WebBrowserComponent (const Options& options)
    : browser (new Pimpl (*this, options.getUserAgent()))
{
    ignoreUnused (blankPageShown);
    ignoreUnused (unloadPageWhenHidden);

    setOpaque (true);

    browser->init();
}

WebBrowserComponent::~WebBrowserComponent()
{
}

//==============================================================================
void WebBrowserComponent::goToURL (const String& url,
                                   const StringArray* headers,
                                   const MemoryBlock* postData)
{
    lastURL = url;

    if (headers != nullptr)
        lastHeaders = *headers;
    else
        lastHeaders.clear();

    if (postData != nullptr)
        lastPostData = *postData;
    else
        lastPostData.reset();

    browser->goToURL (url, headers, postData);
}

void WebBrowserComponent::stop()
{
    browser->stop();
}

void WebBrowserComponent::goBack()
{
    lastURL.clear();

    browser->goBack();
}

void WebBrowserComponent::goForward()
{
    lastURL.clear();
    browser->goForward();
}

void WebBrowserComponent::refresh()
{
    browser->refresh();
}

//==============================================================================
void WebBrowserComponent::paint (Graphics& g)
{
    g.fillAll (Colours::white);
}

void WebBrowserComponent::checkWindowAssociation()
{
    if (browser != nullptr)
        browser->checkWindowAssociation();
}

void WebBrowserComponent::reloadLastURL()
{
    if (lastURL.isNotEmpty())
    {
        goToURL (lastURL, &lastHeaders, &lastPostData);
        lastURL.clear();
    }
}

void WebBrowserComponent::parentHierarchyChanged()
{
    checkWindowAssociation();
}

void WebBrowserComponent::resized()
{
    if (browser != nullptr)
        browser->resized();
}

void WebBrowserComponent::visibilityChanged()
{
    checkWindowAssociation();
}

void WebBrowserComponent::focusGainedWithDirection (FocusChangeType, FocusChangeDirection)
{
}

void WebBrowserComponent::clearCookies()
{
    // Currently not implemented on linux as WebBrowserComponent currently does not
    // store cookies on linux
    jassertfalse;
}

bool WebBrowserComponent::areOptionsSupported (const Options& options)
{
    return (options.getBackend() == Options::Backend::defaultBackend);
}

extern "C" __attribute__ ((visibility ("default"))) int juce_gtkWebkitMain (int argc, const char* const* argv)
{
    if (argc < 4)
        return -1;

    GtkChildProcess child (String (argv[2]).getIntValue(),
                           String (argv[3]).getIntValue(),
                           argc >= 5 ? String (argv[4]) : String());

    return child.entry();
}

} // namespace juce
