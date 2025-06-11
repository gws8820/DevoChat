import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

export const useFileUpload = (initialFiles = []) => {
  const [uploadedFiles, setUploadedFiles] = useState(initialFiles);
  
  const maxFileSize = 10 * 1024 * 1024;

  const uploadFiles = useCallback(
    async (file, uniqueId) => {
      const formData = new FormData();
      formData.append("file", file);

      try {
        if (file.type.startsWith("image/")) {
          const res = await fetch(
            `${process.env.REACT_APP_FASTAPI_URL}/upload/image`,
            {
              method: "POST",
              body: formData,
            }
          );
          
          if (res.status === 401) {
            if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
              window.location.href = '/login?expired=true';
            }
            return;
          }
          
          if (!res.ok) {
            if (res.status === 422) {
              throw new Error(`${file.name}는 업로드할 수 없는 파일입니다.`);
            }
            throw new Error(`${file.name} 파일을 처리 중 오류가 발생했습니다.`);
          }
          
          const data = await res.json();
          if (data.error) {
            throw new Error(data.error);
          }
          return {
            id: uniqueId,
            type: data.type,
            name: data.name,
            content: data.content,
          };
        } 
        
        else {
          const res = await fetch(
            `${process.env.REACT_APP_FASTAPI_URL}/upload/file`,
            {
              method: "POST",
              body: formData,
            }
          );
          
          if (res.status === 401) {
            if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
              window.location.href = '/login?expired=true';
            }
            return;
          }
          
          if (!res.ok) {
            if (res.status === 422) {
              throw new Error(`${file.name}는 업로드할 수 없는 파일입니다.`);
            }
            throw new Error(`${file.name} 파일을 처리 중 오류가 발생했습니다.`);
          }
          
          const data = await res.json();
          if (data.error) {
            throw new Error(data.error);
          }
          return {
            id: uniqueId,
            type: data.type,
            name: data.name,
            content: data.content,
          };
        }
      } catch (error) {
        throw error;
      }
    },
    []
  );

  const processFiles = useCallback(
    async (files, onError, canReadImage) => {
      const maxAllowed = 10;
      let acceptedFiles = [];
      const currentCount = uploadedFiles.length;
      const remaining = maxAllowed - currentCount;
      
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length > 0 && canReadImage === false) {
        onError?.("해당 모델은 이미지 업로드를 지원하지 않습니다.");
        return;
      }
      
      const sizeAcceptedFiles = files.filter((file) => file.size <= maxFileSize);
      const rejectedSizeFiles = files.filter((file) => file.size > maxFileSize);

      if (sizeAcceptedFiles.length > remaining) {
        onError?.("최대 업로드 가능한 파일 개수를 초과했습니다.");
        acceptedFiles = sizeAcceptedFiles.slice(0, remaining);
      }
      else if (rejectedSizeFiles.length > 0) {
        onError?.("10MB를 초과하는 파일은 업로드할 수 없습니다.");
        acceptedFiles = sizeAcceptedFiles;
      }
      else {
        acceptedFiles = sizeAcceptedFiles;
      }
      
      const filePairs = acceptedFiles.map((file) => {
        const uniqueId = uuidv4();
        return { file, uniqueId };
      });

      setUploadedFiles((prev) => [
        ...prev,
        ...filePairs.map(({ file, uniqueId }) => ({
          id: uniqueId,
          name: file.name,
        })),
      ]);

      await Promise.all(
        filePairs.map(async ({ file, uniqueId }) => {
          try {
            const result = await uploadFiles(file, uniqueId);
            setUploadedFiles((prev) =>
              prev.map((item) =>
                item.id === uniqueId ? result : item
              )
            );
          } catch (err) {
            onError?.(err.message);
            setUploadedFiles((prev) =>
              prev.filter((item) => item.id !== uniqueId)
            );
          }
        })
      );
      
      return uploadedFiles;
    },
    [uploadedFiles, maxFileSize, uploadFiles, setUploadedFiles]
  );
  
  const removeFile = useCallback((fileId) => {
    setUploadedFiles((prev) => prev.filter((file) => file.id !== fileId));
  }, [setUploadedFiles]);

  return {
    uploadedFiles,
    setUploadedFiles,
    uploadFiles,
    processFiles,
    removeFile,
    maxFileSize
  };
}; 