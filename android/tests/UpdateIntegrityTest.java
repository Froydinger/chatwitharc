package chat.askarc.android;
import java.io.ByteArrayInputStream;
public class UpdateIntegrityTest {
  static void expect(boolean condition) { if (!condition) throw new AssertionError(); }
  public static void main(String[] args) throws Exception {
    String url="https://github.com/Froydinger/chatwitharc/releases/download/android-latest/ArcAI-Android-Beta.apk";
    String hash="ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(UpdateIntegrity.validMetadata("chat.askarc.android",url,3,2,hash,3));
    expect(!UpdateIntegrity.validMetadata("other.app",url,3,2,hash,3));
    expect(!UpdateIntegrity.validMetadata("chat.askarc.android",url+"?evil",3,2,hash,3));
    expect(!UpdateIntegrity.validMetadata("chat.askarc.android",url,2,2,hash,3));
    expect(!UpdateIntegrity.validMetadata("chat.askarc.android",url,3,2,"bad",3));
    expect(!UpdateIntegrity.validMetadata("chat.askarc.android",url,3,2,hash,100000001));
    expect(UpdateIntegrity.verify(new ByteArrayInputStream("abc".getBytes()),hash,3));
    expect(!UpdateIntegrity.verify(new ByteArrayInputStream("abd".getBytes()),hash,3));
    expect(!UpdateIntegrity.verify(new ByteArrayInputStream("abc".getBytes()),hash,2));
    expect(!UpdateIntegrity.verify(new ByteArrayInputStream("abc".getBytes()),hash,4));
    System.out.println("Update metadata and download integrity checks passed");
  }
}
