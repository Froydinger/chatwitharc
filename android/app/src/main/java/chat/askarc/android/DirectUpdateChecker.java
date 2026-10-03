package chat.askarc.android;

import android.app.Activity;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/** Direct APK updates only; Play installations retain their own update channel. */
final class DirectUpdateChecker {
    static final String APK_URL = "https://github.com/Froydinger/chatwitharc/releases/download/android-latest/ArcAI-Android-Beta.apk";
    static void check(Activity activity) {
        final android.content.Context context = activity.getApplicationContext();
        if (context.getSharedPreferences("direct-update-download", 0).getLong("id", -1) > 0) {
            Intent pending = new Intent(context, DirectUpdateActivity.class);
            pending.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(pending);
            return;
        }
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL("https://github.com/Froydinger/chatwitharc/releases/download/android-latest/android-update.json").openConnection();
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(8000);
                if (connection.getResponseCode() != 200) return;
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (InputStream stream = connection.getInputStream()) {
                    byte[] buffer = new byte[1024]; int count;
                    while ((count = stream.read(buffer)) != -1) {
                        if (bytes.size() + count > 8192) return;
                        bytes.write(buffer, 0, count);
                    }
                }
                JSONObject update = new JSONObject(bytes.toString("UTF-8"));
                long current = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionCode;
                long latest = update.getLong("versionCode");
                String digest = update.getString("sha256");
                long size = update.getLong("size");
                if (!UpdateIntegrity.validMetadata(update.getString("packageId"), update.getString("apkUrl"), latest, current, digest, size)) return;
                long skipped = context.getSharedPreferences("direct-updates", 0).getLong("skipped", 0);
                if (skipped >= latest) return;
                new Handler(Looper.getMainLooper()).post(() -> {
                    Intent intent = new Intent(context, DirectUpdateActivity.class);
                    intent.putExtra("versionCode", latest);
                    intent.putExtra("sha256", digest);
                    intent.putExtra("size", size);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(intent);
                });
            } catch (Exception ignored) {
                // Offline or unpublished feed must never prevent opening Arc.
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "Arc-direct-update").start();
    }
}
