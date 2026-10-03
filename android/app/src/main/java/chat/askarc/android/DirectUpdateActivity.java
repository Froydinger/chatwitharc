package chat.askarc.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.widget.Toast;

public final class DirectUpdateActivity extends Activity {
    private long requestId = -1;
    private boolean registered;
    private boolean verifying;
    private final android.content.BroadcastReceiver completed = new android.content.BroadcastReceiver() {
        @Override public void onReceive(android.content.Context context, Intent intent) {
            if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -2) != requestId) return;
            new Thread(() -> verifyDownload()).start();
        }
    };
    private synchronized void verifyDownload() {
        if (verifying) return;
        verifying = true;
        boolean valid = false;
        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        try {
            Uri uri = manager.getUriForDownloadedFile(requestId);
            if (uri != null) {
                try (java.io.InputStream input = getContentResolver().openInputStream(uri)) {
                    valid = UpdateIntegrity.verify(input, getIntent().getStringExtra("sha256"), getIntent().getLongExtra("size", -1));
                }
            }
        } catch (Exception ignored) { }
        if (!valid) manager.remove(requestId);
        getSharedPreferences("direct-update-download", 0).edit().clear().apply();
        final boolean verified = valid;
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed()) return;
            new AlertDialog.Builder(this).setTitle(verified ? "ArcAI is ready to install" : "Download could not be verified")
                .setMessage(verified ? "Open Downloads, then tap the ArcAI APK to install the update." : "The download was removed. Try again later.")
                .setPositiveButton(verified ? "Open Downloads" : "OK", (dialog, which) -> {
                    if (verified) {
                        try { startActivity(new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS)); }
                        catch (android.content.ActivityNotFoundException ignored) {
                            Toast.makeText(this, "Open Files, then Downloads to install ArcAI.", Toast.LENGTH_LONG).show();
                        }
                    }
                    finish();
                }).setOnCancelListener(dialog -> finish()).show();
        });
    }
    @Override protected void onDestroy() {
        if (registered) unregisterReceiver(completed);
        super.onDestroy();
    }
    private void registerCompletion() {
        if (registered) return;
        android.content.IntentFilter filter = new android.content.IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (android.os.Build.VERSION.SDK_INT >= 33) registerReceiver(completed, filter, RECEIVER_EXPORTED);
        else registerReceiver(completed, filter);
        registered = true;
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        state.putLong("requestId", requestId);
        super.onSaveInstanceState(state);
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        android.content.SharedPreferences pending = getSharedPreferences("direct-update-download", 0);
        long savedId = pending.getLong("id", -1);
        if (savedId > 0) {
            requestId = savedId;
            getIntent().putExtra("sha256", pending.getString("sha256", ""));
            getIntent().putExtra("size", pending.getLong("size", -1));
            registerCompletion(); checkCompletion(); return;
        }
        if (state != null) {
            requestId = state.getLong("requestId", -1);
            if (requestId > 0) { registerCompletion(); checkCompletion(); return; }
        }
        new AlertDialog.Builder(this)
            .setTitle("An ArcAI update is ready")
            .setMessage("Download the latest app, then open the APK in Downloads to install it. Your chats and settings stay with you.")
            .setPositiveButton("Download update", (dialog, which) -> download())
            .setNegativeButton("Later", (dialog, which) -> {
                getSharedPreferences("direct-updates", 0).edit().putLong("skipped", getIntent().getLongExtra("versionCode", 0)).apply();
                finish();
            })
            .setOnCancelListener(dialog -> finish()).show();
    }
    @Override protected void onResume() {
        super.onResume();
        if (requestId > 0) checkCompletion();
    }
    private void checkCompletion() {
        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        try (android.database.Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(requestId))) {
            if (cursor.moveToFirst()) {
                int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                if (status == DownloadManager.STATUS_SUCCESSFUL || status == DownloadManager.STATUS_FAILED)
                    new Thread(() -> verifyDownload()).start();
            } else {
                getSharedPreferences("direct-update-download", 0).edit().clear().apply();
                finish();
            }
        }
    }
    private void download() {
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(DirectUpdateChecker.APK_URL));
            request.setTitle("ArcAI update");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "ArcAI-update-" + getIntent().getLongExtra("versionCode", 0) + ".apk");
            registerCompletion();
            requestId = ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
            getSharedPreferences("direct-update-download", 0).edit().putLong("id", requestId)
                .putString("sha256", getIntent().getStringExtra("sha256"))
                .putLong("size", getIntent().getLongExtra("size", -1)).apply();
            new AlertDialog.Builder(this).setTitle("Downloading ArcAI")
                .setMessage("The download continues while you use Arc. Reopen Arc after it finishes to verify the APK and open Downloads.")
                .setPositiveButton("Continue using Arc", (dialog, which) -> finish())
                .setOnCancelListener(dialog -> finish()).show();
            Toast.makeText(this, "Downloading ArcAI. Open the APK when the download finishes.", Toast.LENGTH_LONG).show();
        } catch (Exception ignored) {
            Toast.makeText(this, "Download unavailable. Please try again later.", Toast.LENGTH_LONG).show();
            finish();
        }
    }
}
