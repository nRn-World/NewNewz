package one.nrnworld.newzlocal;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.provider.Settings;
import android.view.KeyEvent;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://nrnworld.one/NewzLocal/";
    private static final int REQ_NOTIFICATIONS = 1001;
    private static final int REQ_LOCATION = 1002;
    private static final String PREF_ASKED_NOTIF = "asked_notif_once";

    private WebView webView;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private long lastResumePollMs = 0L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window win = getWindow();
        if (win != null) {
            win.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            win.setStatusBarColor(Color.parseColor("#14110C"));
            win.setNavigationBarColor(Color.parseColor("#14110C"));
        }

        NotificationHelper.ensureChannel(this);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#14110C"));
        configureWebView(webView);
        setContentView(webView);

        String startUrl = resolveIntentUrl(getIntent());
        webView.loadUrl(startUrl != null ? startUrl : HOME_URL);

        // Prompt for Android 13+ notification permission on first APK launch so favourite alerts work immediately
        if (Build.VERSION.SDK_INT >= 33 && !NotificationHelper.hasPermission(this)) {
            webView.postDelayed(new Runnable() {
                @Override
                public void run() {
                    requestAndroidNotificationPerm(false);
                }
            }, 1200L);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String targetUrl = resolveIntentUrl(intent);
        if (targetUrl != null && webView != null) {
            webView.loadUrl(targetUrl);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        pushPermStateToJs();
        long now = System.currentTimeMillis();
        if (now - lastResumePollMs > 120_000L) {
            lastResumePollMs = now;
            final Context appCtx = getApplicationContext();
            Thread t = new Thread(new Runnable() {
                @Override
                public void run() {
                    FavoriteChecker.pollNow(appCtx, false);
                }
            });
            t.setDaemon(true);
            t.start();
        }
    }

    private String resolveIntentUrl(Intent intent) {
        if (intent == null) return null;
        String extraUrl = intent.getStringExtra("open_url");
        if (extraUrl != null && extraUrl.startsWith("https://nrnworld.one/NewzLocal")) {
            return extraUrl;
        }
        Uri data = intent.getData();
        if (data != null && "nrnworld.one".equalsIgnoreCase(data.getHost())) {
            return data.toString();
        }
        return null;
    }

    @SuppressWarnings("deprecation")
    private void configureWebView(WebView wv) {
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true);

        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setUserAgentString(s.getUserAgentString() + " NewzLocalAndroidAPK/1.2");

        wv.addJavascriptInterface(new AndroidBridge(), "NewzLocalAndroid");

        wv.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) return false;
                String scheme = uri.getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    String host = uri.getHost();
                    if (host != null && host.equalsIgnoreCase("nrnworld.one")
                            && (uri.getPath() == null || uri.getPath().startsWith("/NewzLocal"))) {
                        return false;
                    }
                    openExternalBrowser(uri);
                    return true;
                }
                openExternalBrowser(uri);
                return true;
            }
        });

        wv.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView tempView = new WebView(MainActivity.this);
                tempView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                        if (req.getUrl() != null) {
                            openExternalBrowser(req.getUrl());
                        }
                        v.destroy();
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(tempView);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (checkSelfPermission("android.permission.ACCESS_FINE_LOCATION") == PackageManager.PERMISSION_GRANTED
                        || checkSelfPermission("android.permission.ACCESS_COARSE_LOCATION") == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    pendingGeoOrigin = origin;
                    pendingGeoCallback = callback;
                    requestPermissions(new String[]{
                            "android.permission.ACCESS_FINE_LOCATION",
                            "android.permission.ACCESS_COARSE_LOCATION"
                    }, REQ_LOCATION);
                }
            }
        });
    }

    private void openExternalBrowser(Uri uri) {
        try {
            Intent ext = new Intent(Intent.ACTION_VIEW, uri);
            ext.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(ext);
        } catch (Exception ignored) {
        }
    }

    private String currentPermState() {
        if (NotificationHelper.hasPermission(this)) return "granted";
        if (Build.VERSION.SDK_INT >= 33) {
            SharedPreferences sp = getSharedPreferences(FavoriteChecker.PREFS, Context.MODE_PRIVATE);
            boolean askedOnce = sp.getBoolean(PREF_ASKED_NOTIF, false);
            if (!askedOnce || shouldShowRequestPermissionRationale(NotificationHelper.POST_NOTIFICATIONS_PERM)) {
                return "default";
            }
            return "denied";
        }
        return "denied";
    }

    private void requestAndroidNotificationPerm(boolean openSettingsIfBlocked) {
        if (NotificationHelper.hasPermission(this)) {
            pushPermStateToJs();
            return;
        }
        if (Build.VERSION.SDK_INT >= 33) {
            SharedPreferences sp = getSharedPreferences(FavoriteChecker.PREFS, Context.MODE_PRIVATE);
            boolean askedOnce = sp.getBoolean(PREF_ASKED_NOTIF, false);
            boolean canPrompt = !askedOnce || shouldShowRequestPermissionRationale(NotificationHelper.POST_NOTIFICATIONS_PERM);
            sp.edit().putBoolean(PREF_ASKED_NOTIF, true).apply();
            if (canPrompt) {
                requestPermissions(new String[]{NotificationHelper.POST_NOTIFICATIONS_PERM}, REQ_NOTIFICATIONS);
                return;
            }
        }
        if (openSettingsIfBlocked) {
            openAppNotificationSettings();
        }
    }

    private void openAppNotificationSettings() {
        try {
            Intent intent = new Intent();
            if (Build.VERSION.SDK_INT >= 26) {
                intent.setAction(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            } else {
                intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.fromParts("package", getPackageName(), null));
            }
            startActivity(intent);
        } catch (Exception ignored) {
        }
    }

    private void pushPermStateToJs() {
        if (webView == null) return;
        final String state = currentPermState();
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView != null) {
                    webView.evaluateJavascript(
                            "window.__onAndroidNotifPerm && window.__onAndroidNotifPerm('" + state + "');",
                            null
                    );
                }
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_NOTIFICATIONS) {
            pushPermStateToJs();
        } else if (requestCode == REQ_LOCATION && pendingGeoCallback != null) {
            boolean granted = grantResults != null && grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    public final class AndroidBridge {
        @JavascriptInterface
        public boolean isAndroidApk() {
            return true;
        }

        @JavascriptInterface
        public String getNotificationPermission() {
            return currentPermState();
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    requestAndroidNotificationPerm(true);
                }
            });
        }

        @JavascriptInterface
        public void syncFavorites(String payloadJson) {
            if (payloadJson == null) return;
            FavoriteChecker.savePayloadAndSchedule(getApplicationContext(), payloadJson);
        }

        @JavascriptInterface
        public boolean notifyNow(String title, String body, String deepUrl, String tag) {
            Context appCtx = getApplicationContext();
            if (!NotificationHelper.hasPermission(appCtx)) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        requestAndroidNotificationPerm(true);
                    }
                });
                return false;
            }
            NotificationHelper.show(
                    appCtx,
                    title != null ? title : "NewzLocal",
                    body != null ? body : "",
                    deepUrl != null ? deepUrl : HOME_URL,
                    tag != null ? tag : "newzlocal"
            );
            return true;
        }

        @JavascriptInterface
        public void checkNow() {
            final Context appCtx = getApplicationContext();
            Thread t = new Thread(new Runnable() {
                @Override
                public void run() {
                    FavoriteChecker.pollNow(appCtx, false);
                }
            });
            t.setDaemon(true);
            t.start();
        }
    }
}
