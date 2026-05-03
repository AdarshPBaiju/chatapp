import { httpClient } from "@/shared/http/client";

export interface SignedUrlResponse {
  signed_url: string;
  s3_key: string;
  expires_at: string;
}

export const requestSignedUrl = async (filename: string, contentType: string): Promise<SignedUrlResponse> => {
  const response = await httpClient.post("/v1/media/signed-url", {
    filename,
    content_type: contentType,
  });
  return response.data.data;
};

export const uploadFileToS3 = async (
  file: File,
  signedUrl: string,
  onProgress?: (progress: number) => void
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", file.type);

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          onProgress(percentComplete);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
};
