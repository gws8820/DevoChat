import { useState, useCallback, useContext } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { SettingsContext } from '../contexts/SettingsContext';
import { useToast } from '../contexts/ToastContext';

export const useFileUpload = (initialFiles = [], userInfo = null, mode = "chat") => {
  const [uploadedFiles, setUploadedFiles] = useState(initialFiles);
  const {
    canVision,
    canVisionImage,
    visionDefaultModel,
    visionDefaultImageModel,
    updateModel,
    updateImageModel,
  } = useContext(SettingsContext);
  const { showToast } = useToast();

  const currentCanVision = mode === "image" ? canVisionImage : canVision;

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
    async (files) => {
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length > 0 && !currentCanVision) {
        const target = mode === "image" ? visionDefaultImageModel : visionDefaultModel;
        if (target) {
          if (mode === "image") updateImageModel(target);
          else updateModel(target);
          showToast("이미지 지원 모델로 변경되었습니다.", "info");
        } else {
          showToast("해당 모델은 이미지 업로드를 지원하지 않습니다.");
          return;
        }
      }

      let acceptedFiles = files;
      if (!userInfo?.admin) {
        const currentCount = uploadedFiles.length;
        const maxAllowed = 10;
        const remaining = maxAllowed - currentCount;

        if (files.length > remaining) {
          showToast(`최대 ${maxAllowed}개까지 업로드할 수 있습니다.`);
          acceptedFiles = files.slice(0, remaining);
        }
      }
      
      const filePairs = acceptedFiles.map((file) => {
        const uniqueId = uuidv4();
        const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        return { file, uniqueId, preview };
      });

      setUploadedFiles((prev) => [
        ...prev,
        ...filePairs.map(({ file, uniqueId, preview }) => ({
          id: uniqueId,
          name: file.name,
          type: file.type,
          preview,
        })),
      ]);

      await Promise.all(
        filePairs.map(async ({ file, uniqueId }) => {
          try {
            const result = await uploadFiles(file, uniqueId);
            setUploadedFiles((prev) =>
              prev.map((item) =>
                item.id === uniqueId ? { ...item, ...result } : item
              )
            );
          } catch (err) {
            showToast(err.message);
            setUploadedFiles((prev) => {
              const target = prev.find((item) => item.id === uniqueId);
              if (target && target.preview) {
                URL.revokeObjectURL(target.preview);
              }
              return prev.filter((item) => item.id !== uniqueId);
            });
          }
        })
      );

      return uploadedFiles;
    },
    [uploadedFiles, uploadFiles, setUploadedFiles, userInfo, currentCanVision, visionDefaultModel, visionDefaultImageModel, updateModel, updateImageModel, showToast, mode]
  );
  
  const removeFile = useCallback((fileId) => {
    setUploadedFiles((prev) => {
      const target = prev.find((file) => file.id === fileId);
      if (target && target.preview) {
        URL.revokeObjectURL(target.preview);
      }
      return prev.filter((file) => file.id !== fileId);
    });
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