/**
 * Media utilities for compression and format conversion (HEIC support)
 */

export const compressImage = async (file: File, maxWidth = 1600, quality = 0.7): Promise<File> => {
  let processedFile = file;

  // Handle HEIC
  if (file.type === "image/heic" || file.name.toLowerCase().endsWith(".heic")) {
    try {
      const heic2any = (await import("heic2any")).default;
      const convertedBlob = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: quality
      });
      processedFile = new File(
        [Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob],
        file.name.replace(/\.[^/.]+$/, ".jpg"),
        { type: "image/jpeg" }
      );
    } catch (error) {
      console.error("HEIC conversion failed, falling back to original:", error);
    }
  }

  // Skip compression for non-images
  if (!processedFile.type.startsWith("image/")) return processedFile;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(processedFile);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Resize if too large
        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], processedFile.name, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              // Return smaller file, otherwise original
              resolve(compressedFile.size < processedFile.size ? compressedFile : processedFile);
            } else {
              resolve(processedFile);
            }
          },
          "image/jpeg",
          quality
        );
      };
    };
    reader.onerror = () => resolve(processedFile);
  });
};
