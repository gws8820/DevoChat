import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

export const useFileUpload = (initialFiles = []) => {
  const [uploadedFiles, setUploadedFiles] = useState(initialFiles);
  const [errorModal, setErrorModal] = useState(null);
  
  const maxFileSize = 50 * 1024 * 1024;
  const allowedExtensions = /\.(zip|pdf|doc|docx|pptx|xlsx|csv|txt|text|rtf|html|htm|odt|eml|epub|msg|json|wav|mp3|ogg|flac|amr|amr-wb|mulaw|alaw|webm|m4a|mp4|md|markdown|xml|tsv|yml|yaml|py|pyw|rb|pl|java|c|cpp|h|hpp|v|js|jsx|ts|tsx|css|scss|less|cs|sh|bash|bat|ps1|ini|conf|cfg|toml|tex|r|swift|scala|hs|erl|ex|exs|go|rs|php)$/i;

  const uploadFiles = useCallback(
    async (file, uniqueId) => {
      const formData = new FormData();
      formData.append("file", file);

      if (file.type.startsWith("image/")) {
        const res = await fetch(
          `${process.env.REACT_APP_FASTAPI_URL}/upload/image`,
          {
            method: "POST",
            body: formData,
          }
        );
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
      } else {
        const res = await fetch(
          `${process.env.REACT_APP_FASTAPI_URL}/upload/file`,
          {
            method: "POST",
            body: formData,
          }
        );
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
    },
    []
  );

  const processFiles = useCallback(
    async (files) => {
      const maxAllowed = 10;
      let acceptedFiles = [];
      const currentCount = uploadedFiles.length;
      const remaining = maxAllowed - currentCount;
      
      const sizeAcceptedFiles = files.filter((file) => file.size <= maxFileSize);
      const rejectedSizeFiles = files.filter((file) => file.size > maxFileSize);

      if (sizeAcceptedFiles.length > remaining) {
        setErrorModal("최대 업로드 가능한 파일 개수를 초과했습니다.");
        setTimeout(() => setErrorModal(null), 3000);
        acceptedFiles = sizeAcceptedFiles.slice(0, remaining);
      }
      else if (rejectedSizeFiles.length > 0) {
        setErrorModal("50MB를 초과하는 파일은 업로드할 수 없습니다.");
        setTimeout(() => setErrorModal(null), 3000);
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
            setErrorModal("파일 처리 중 오류가 발생했습니다.");
            setTimeout(() => setErrorModal(null), 3000);
            setUploadedFiles((prev) =>
              prev.filter((item) => item.id !== uniqueId)
            );
          }
        })
      );
      
      return uploadedFiles;
    },
    [uploadedFiles, maxFileSize, uploadFiles, setErrorModal, setUploadedFiles]
  );
  
  const removeFile = useCallback((fileId) => {
    setUploadedFiles((prev) => prev.filter((file) => file.id !== fileId));
  }, [setUploadedFiles]);

  return {
    uploadedFiles,
    setUploadedFiles,
    errorModal,
    setErrorModal,
    uploadFiles,
    processFiles,
    removeFile,
    maxFileSize,
    allowedExtensions
  };
}; 