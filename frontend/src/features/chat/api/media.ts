import { httpClient } from "@/shared/http/client";

export interface SignedUrlResponse {
  signed_url: string;
  s3_key: string;
  expires_at: string;
}

export interface SignedUrlResponse {
  signed_url: string;
  s3_key: string;
  expires_at: string;
}

export const requestSignedUrl = async (filename: string, contentType: string): Promise<SignedUrlResponse> => {
  const response = await httpClient.post("/media/signed-url", {
    filename,
    content_type: contentType,
  });
  return response.data.data;
};

export const uploadFileToS3 = (
  file: File,
  signedUrl: string,
  onProgress?: (progress: number) => void,
  cancelRef?: { abort?: () => void }
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    if (cancelRef) {
      cancelRef.abort = () => {
        xhr.abort();
        reject(new Error("UPLOAD_CANCELLED"));
      };
    }
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable) {
        onProgress((event.loaded / event.total) * 100);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(file);
  });
};

export interface MultipartInitResponse {
  upload_id: string;
  s3_key: string;
}

export const initMultipartUpload = async (filename: string, contentType: string): Promise<MultipartInitResponse> => {
  const response = await httpClient.post("/media/multipart/init", {
    filename,
    content_type: contentType,
  });
  return response.data.data;
};

export const getPartSignedUrl = async (s3Key: string, uploadId: string, partNumber: number): Promise<string> => {
  const response = await httpClient.post("/media/multipart/presign-part", {
    s3_key: s3Key,
    upload_id: uploadId,
    part_number: partNumber,
  });
  return response.data.data.presigned_url;
};

export const completeMultipartUpload = async (s3Key: string, uploadId: string, parts: { part_number: number; etag: string }[]): Promise<void> => {
  await httpClient.post("/media/multipart/complete", {
    s3_key: s3Key,
    upload_id: uploadId,
    parts,
  });
};

export const uploadPart = (
  part: Blob,
  signedUrl: string,
  onProgress?: (progress: number) => void,
  cancelRef?: { abort?: () => void }
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    if (cancelRef) {
      cancelRef.abort = () => {
        xhr.abort();
        reject(new Error("UPLOAD_CANCELLED"));
      };
    }
    xhr.open("PUT", signedUrl);
    // Note: Do NOT set Content-Type here if the signed URL was generated without it, 
    // or set it to match exactly what was signed. In S3/MinIO, part uploads usually don't need it.

    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable) {
        onProgress((event.loaded / event.total) * 100);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        if (etag) resolve(etag.replace(/"/g, ""));
        else resolve("");
      } else {
        reject(new Error(`Part upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(part);
  });
};
