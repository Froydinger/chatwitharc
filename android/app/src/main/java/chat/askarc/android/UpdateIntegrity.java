package chat.askarc.android;

import java.io.InputStream;
import java.security.MessageDigest;

final class UpdateIntegrity {
    static boolean validMetadata(String packageId, String url, long version, long current, String sha256, long size) {
        return "chat.askarc.android".equals(packageId)
            && "https://github.com/Froydinger/chatwitharc/releases/download/android-latest/ArcAI-Android-Beta.apk".equals(url)
            && version > current && sha256 != null && sha256.matches("[0-9a-f]{64}")
            && size > 0 && size <= 100000000;
    }
    static boolean verify(InputStream input, String expectedHash, long expectedSize) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long size = 0; byte[] buffer = new byte[8192]; int count;
        while ((count = input.read(buffer)) != -1) {
            size += count;
            if (size > expectedSize) return false;
            digest.update(buffer, 0, count);
        }
        StringBuilder hex = new StringBuilder();
        for (byte value : digest.digest()) hex.append(String.format("%02x", value & 255));
        return size == expectedSize && hex.toString().equals(expectedHash);
    }
}
