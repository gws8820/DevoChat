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
              credentials: 'include',
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
            throw new Error(`${file.name} 처리 중 오류가 발생했습니다.`);
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
              credentials: 'include',
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
            if (res.status === 413) {
              throw new Error(`${file.name}는 파일 크기 제한을 초과하여 업로드할 수 없습니다.`);
            }
            throw new Error(`${file.name} 처리 중 오류가 발생했습니다.`);
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
            file_path: data.file_path
          };
        }
      } catch (error) {
        throw error;
      }
    },
    []
  );

  const processFiles = useCallback(
    async (files, onError, imageSupport, maxAllowed = 10) => {
      let acceptedFiles = [];
      const currentCount = uploadedFiles.length;
      const remaining = maxAllowed - currentCount;
      
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length > 0 && !imageSupport) {
        onError?.("해당 모델은 이미지 업로드를 지원하지 않습니다.");
        return;
      }
      
      if (files.length > remaining) {
        onError?.(`최대 ${maxAllowed}개까지 업로드할 수 있습니다.`);
        acceptedFiles = files.slice(0, remaining);
      } else {
        acceptedFiles = files;
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
    [uploadedFiles, uploadFiles, setUploadedFiles]
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