package id.aromajiwa.hadir;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Aroma Jiwa Hadir - pembungkus Android untuk aplikasi web.
 *
 * Aplikasi web (PWA) membutuhkan server Python, sehingga WebView ini memuat
 * alamat server yang dapat diubah tanpa membangun ulang APK:
 *   1. nilai awal dari gradle.properties (AROMA_BASE_URL)
 *   2. bisa diganti dari layar "Server tidak terjangkau" atau tombol back panjang
 */
public class MainActivity extends Activity {

    private static final String PREFS = "aroma_jiwa";
    private static final String KEY_URL = "base_url";
    private static final int REQ_LOCATION = 1101;
    private static final int REQ_CAMERA = 1102;

    private WebView web;
    private FrameLayout root;
    private SharedPreferences prefs;

    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;
    private PermissionRequest pendingMediaPermission;

    private long lastBackPress;

    private LocationManager locationManager;
    private LocationListener locationListener;
    private Runnable locationTimeout;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean pendingLocationReply;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        root = new FrameLayout(this);
        web = new WebView(this);
        web.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(0xFFF2F5FC);
        root.addView(web);
        setContentView(root);

        configureWebView();
        web.loadUrl(baseUrl());
    }

    // ------------------------------------------------------------------ setup

    private void configureWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadsImagesAutomatically(true);
        s.setUseWideViewPort(false);
        s.setLoadWithOverviewMode(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setGeolocationEnabled(true);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);

        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "AromaAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    view.loadUrl("file:///android_asset/offline.html");
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    if (!isOurHost(request.getOrigin())) {
                        request.deny();
                        return;
                    }
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(request.getResources());
                    } else {
                        pendingMediaPermission = request;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                    }
                });
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                                                           GeolocationPermissions.Callback callback) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    geoOrigin = origin;
                    geoCallback = callback;
                    requestPermissions(new String[]{
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
                }
            }
        });

        // Unduhan langsung (mis. tautan yang dibuka lewat DownloadListener) tetap didukung.
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url == null || url.startsWith("blob:")) return;
            try {
                String fileName = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType);
                android.app.DownloadManager.Request req = new android.app.DownloadManager.Request(Uri.parse(url));
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) req.addRequestHeader("Cookie", cookie);
                if (userAgent != null) req.addRequestHeader("User-Agent", userAgent);
                if (mimeType != null) req.setMimeType(mimeType);
                req.setNotificationVisibility(
                        android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                android.app.DownloadManager dm =
                        (android.app.DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                if (dm != null) dm.enqueue(req);
            } catch (Exception ignored) {
                toast("Gagal mengunduh berkas.");
            }
        });
    }

    // ------------------------------------------------------------------ url handling

    private String baseUrl() {
        String saved = prefs.getString(KEY_URL, "");
        String url = (saved != null && !saved.isEmpty()) ? saved : BuildConfig.BASE_URL;
        if (url == null) url = "http://192.168.1.117:4000";
        return normalize(url);
    }

    /** Menambahkan skema bila belum ada dan membuang garis miring di akhir. */
    private static String normalize(String input) {
        String url = input == null ? "" : input.trim();
        if (url.isEmpty()) return "";
        if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://" + url;
        while (url.endsWith("/")) url = url.substring(0, url.length() - 1);
        return url;
    }

    private static boolean isValidUrl(String candidate) {
        if (candidate == null || candidate.isEmpty()) return false;
        if (!candidate.startsWith("http://") && !candidate.startsWith("https://")) return false;
        Uri uri = Uri.parse(candidate);
        String host = uri.getHost();
        return host != null && !host.isEmpty() && !host.contains(" ");
    }

    private boolean isOurHost(Uri uri) {
        if (uri == null) return false;
        String own = Uri.parse(baseUrl()).getHost();
        String host = uri.getHost();
        return own != null && own.equalsIgnoreCase(host);
    }

    private boolean handleUrl(Uri uri) {
        if (uri == null) return true;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        if ((scheme.equals("http") || scheme.equals("https")) && isOurHost(uri)) {
            return false; // tetap di dalam WebView
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
            toast("Tidak ada aplikasi untuk membuka tautan ini.");
        }
        return true;
    }

    // ------------------------------------------------------------------ permissions

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (code == REQ_LOCATION) {
            if (geoCallback != null) geoCallback.invoke(geoOrigin, granted, false);
            geoCallback = null;
            geoOrigin = null;
            if (pendingLocationReply) {
                pendingLocationReply = false;
                if (granted) requestLocationBridge();
                else replyLocation(null);
            }
            if (!granted) toast("Izin lokasi dibutuhkan untuk presensi.");
        } else if (code == REQ_CAMERA) {
            if (pendingMediaPermission != null) {
                if (granted) pendingMediaPermission.grant(pendingMediaPermission.getResources());
                else pendingMediaPermission.deny();
                pendingMediaPermission = null;
            }
            if (!granted) toast("Izin kamera ditolak. Gunakan input kode manual.");
        }
    }

    // ------------------------------------------------------------------ native location

    /**
     * Dipakai jembatan JS: WebView yang memuat http:// bisa menolak
     * navigator.geolocation, jadi koordinat diambil langsung dari perangkat.
     */
    private void requestLocationBridge() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            pendingLocationReply = true;
            requestPermissions(new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
            return;
        }
        LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (lm == null) {
            replyLocation(null);
            return;
        }
        locationManager = lm;

        Location best = null;
        for (String provider : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
            try {
                Location last = lm.getLastKnownLocation(provider);
                if (last != null && (best == null || last.getTime() > best.getTime())) best = last;
            } catch (SecurityException | IllegalArgumentException ignored) {
                // provider tidak tersedia di perangkat ini
            }
        }
        if (best != null && System.currentTimeMillis() - best.getTime() < 60000L) {
            replyLocation(best);
            return;
        }

        stopLocationUpdates();
        final Location fallback = best;
        locationListener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                stopLocationUpdates();
                replyLocation(location);
            }

            @Override
            public void onStatusChanged(String provider, int status, Bundle extras) {
            }

            @Override
            public void onProviderEnabled(String provider) {
            }

            @Override
            public void onProviderDisabled(String provider) {
            }
        };
        try {
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 500L, 0f, locationListener, Looper.getMainLooper());
            lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 500L, 0f, locationListener, Looper.getMainLooper());
        } catch (Exception e) {
            replyLocation(fallback);
            return;
        }
        locationTimeout = () -> {
            stopLocationUpdates();
            replyLocation(fallback);
        };
        handler.postDelayed(locationTimeout, 20000L);
    }

    private void stopLocationUpdates() {
        if (locationTimeout != null) {
            handler.removeCallbacks(locationTimeout);
            locationTimeout = null;
        }
        if (locationManager != null && locationListener != null) {
            try {
                locationManager.removeUpdates(locationListener);
            } catch (Exception ignored) {
                // listener sudah dilepas
            }
        }
        locationListener = null;
    }

    private void replyLocation(final Location location) {
        final String payload;
        if (location == null) {
            payload = "null";
        } else {
            payload = "{\"lat\":" + location.getLatitude()
                    + ",\"lng\":" + location.getLongitude()
                    + ",\"accuracy\":" + (location.hasAccuracy() ? location.getAccuracy() : 0f) + "}";
        }
        runOnUiThread(() -> {
            if (web == null) return;
            web.evaluateJavascript(
                    "window.__aromaGeoResult && window.__aromaGeoResult(" + JSONObject.quote(payload) + ");", null);
        });
    }

    // ------------------------------------------------------------------ back

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastBackPress < 2000) {
            super.onBackPressed();
        } else {
            lastBackPress = now;
            toast("Tekan sekali lagi untuk keluar.");
        }
    }

    /** Tahan tombol back untuk membuka pengaturan alamat server. */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && event.getRepeatCount() >= 3) {
            runOnUiThread(this::promptServer);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    // ------------------------------------------------------------------ lifecycle

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) {
            web.onPause();
            CookieManager.getInstance().flush();
        }
        stopLocationUpdates();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        stopLocationUpdates();
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    // ------------------------------------------------------------------ helpers

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_SHORT).show());
    }

    private void promptServer() {
        final EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setText(baseUrl());
        input.setSelection(input.getText().length());

        new AlertDialog.Builder(this)
                .setTitle("Alamat server")
                .setMessage("Contoh: https://aroma.contoh.com atau http://192.168.1.10:4000")
                .setView(input)
                .setPositiveButton("Simpan", (dialog, which) -> {
                    String url = normalize(input.getText().toString());
                    if (!isValidUrl(url)) {
                        toast("Alamat tidak valid.");
                        return;
                    }
                    prefs.edit().putString(KEY_URL, url).apply();
                    web.loadUrl(url);
                })
                .setNeutralButton("Kembalikan default", (dialog, which) -> {
                    prefs.edit().remove(KEY_URL).apply();
                    web.loadUrl(baseUrl());
                })
                .setNegativeButton("Batal", null)
                .show();
    }

    private void saveBase64File(final String name, final String mime, final String base64) {
        final byte[] bytes;
        try {
            bytes = Base64.decode(base64, Base64.DEFAULT);
        } catch (Exception e) {
            toast("Berkas tidak terbaca.");
            return;
        }
        final String safeName = (name == null || name.trim().isEmpty()) ? "laporan.pdf" : name.replace('/', '_');
        final String safeMime = (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime;

        new Thread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, safeMime);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH,
                            Environment.DIRECTORY_DOWNLOADS + "/Aroma Jiwa");
                    Uri target = getContentResolver()
                            .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (target == null) throw new IllegalStateException("MediaStore menolak berkas.");
                    try (OutputStream out = getContentResolver().openOutputStream(target)) {
                        if (out == null) throw new IllegalStateException("Tidak bisa menulis berkas.");
                        out.write(bytes);
                    }
                    runOnUiThread(() -> {
                        toast("Tersimpan di Downloads/Aroma Jiwa/" + safeName);
                        openFile(target, safeMime);
                    });
                } else {
                    File base = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (base == null) base = getFilesDir();
                    File dir = new File(base, "Aroma Jiwa");
                    if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Folder gagal dibuat.");
                    File file = new File(dir, safeName);
                    try (FileOutputStream out = new FileOutputStream(file)) {
                        out.write(bytes);
                    }
                    final String path = file.getAbsolutePath();
                    runOnUiThread(() -> toast("Tersimpan: " + path));
                }
            } catch (final Exception e) {
                runOnUiThread(() -> toast("Gagal menyimpan berkas: " + e.getMessage()));
            }
        }).start();
    }

    /**
     * Uji koneksi dari sisi native untuk halaman offline. Halaman itu dimuat dari
     * file:// sehingga fetch() ke http:// akan ditolak CORS, jadi permintaan
     * dilakukan di sini lalu hasilnya dikirim balik lewat window.__aromaProbeResult.
     */
    private void probeServer() {
        final String target = baseUrl() + "/api/health";
        new Thread(() -> {
            String result;
            try {
                java.net.HttpURLConnection conn =
                        (java.net.HttpURLConnection) new java.net.URL(target).openConnection();
                // Longgar: layanan gratis seperti Render tidur setelah 15 menit idle
                // dan butuh 30-60 detik untuk bangun saat permintaan pertama datang.
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(30000);
                conn.setRequestMethod("GET");
                int code = conn.getResponseCode();
                conn.disconnect();
                result = "{\"ok\":" + (code == 200) + ",\"code\":" + code + ",\"url\":" + JSONObject.quote(target) + "}";
            } catch (Exception e) {
                result = "{\"ok\":false,\"code\":0,\"url\":" + JSONObject.quote(target)
                        + ",\"error\":" + JSONObject.quote(e.getClass().getSimpleName()) + "}";
            }
            final String payload = result;
            runOnUiThread(() -> {
                if (web == null) return;
                web.evaluateJavascript(
                        "window.__aromaProbeResult && window.__aromaProbeResult(" + JSONObject.quote(payload) + ");", null);
            });
        }).start();
    }

    private void openFile(Uri uri, String mime) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, mime);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(intent);
        } catch (Exception ignored) {
            // tidak ada penampil PDF - berkas tetap tersimpan
        }
    }

    // ------------------------------------------------------------------ JS bridge

    /** Jembatan yang dipakai app/js/api.js dan halaman offline. */
    public class Bridge {

        @JavascriptInterface
        public String baseUrl() {
            return MainActivity.this.baseUrl();
        }

        @JavascriptInterface
        public String version() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public void saveFile(String name, String mime, String base64) {
            saveBase64File(name, mime, base64);
        }

        @JavascriptInterface
        public void requestLocation() {
            runOnUiThread(MainActivity.this::requestLocationBridge);
        }

        @JavascriptInterface
        public void probe() {
            MainActivity.this.probeServer();
        }

        @JavascriptInterface
        public void changeServer() {
            runOnUiThread(MainActivity.this::promptServer);
        }

        @JavascriptInterface
        public void setBaseUrl(String url) {
            final String clean = normalize(url);
            if (!isValidUrl(clean)) {
                toast("Alamat tidak valid.");
                return;
            }
            prefs.edit().putString(KEY_URL, clean).apply();
            runOnUiThread(() -> {
                if (web != null) web.loadUrl(clean);
            });
        }

        @JavascriptInterface
        public void reload() {
            runOnUiThread(() -> {
                if (web != null) web.loadUrl(baseUrl());
            });
        }

        @JavascriptInterface
        public void toast(String message) {
            MainActivity.this.toast(message);
        }
    }
}
