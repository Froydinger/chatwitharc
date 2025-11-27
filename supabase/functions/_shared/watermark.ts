/**
 * Add watermark "A✨" to base64 image
 * @param base64Image - Base64 encoded image string (with or without data:image prefix)
 * @returns Base64 encoded image with watermark
 */
export async function addWatermark(base64Image: string): Promise<string> {
  try {
    // Extract the base64 data
    const base64Data = base64Image.includes('base64,') 
      ? base64Image.split('base64,')[1] 
      : base64Image;
    
    // Decode base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Create blob and load as image
    const blob = new Blob([bytes], { type: 'image/png' });
    const imageBitmap = await createImageBitmap(blob);
    
    // Create canvas and draw image
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    
    ctx.drawImage(imageBitmap, 0, 0);
    
    // Add watermark
    const watermarkText = 'A✨';
    const fontSize = Math.max(14, Math.floor(imageBitmap.height * 0.025)); // 2.5% of image height, min 14px
    ctx.font = `${fontSize}px Arial`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; // White with 60% opacity
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    
    // Position in bottom right with padding
    const padding = Math.floor(fontSize * 0.8);
    ctx.fillText(watermarkText, imageBitmap.width - padding, imageBitmap.height - padding);
    
    // Convert canvas back to base64
    const watermarkedBlob = await canvas.convertToBlob({ type: 'image/png' });
    const arrayBuffer = await watermarkedBlob.arrayBuffer();
    const watermarkedBytes = new Uint8Array(arrayBuffer);
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < watermarkedBytes.byteLength; i++) {
      binary += String.fromCharCode(watermarkedBytes[i]);
    }
    const watermarkedBase64 = btoa(binary);
    
    return `data:image/png;base64,${watermarkedBase64}`;
  } catch (error) {
    console.error('Watermark error:', error);
    // Return original image if watermarking fails
    return base64Image.startsWith('data:') ? base64Image : `data:image/png;base64,${base64Image}`;
  }
}
