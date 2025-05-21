import React, { createContext, useState, useEffect } from "react";
import modelsData from '../models.json';

export const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
  const DEFAULT_MODEL = "gemini-2.5-flash-preview-05-20:default";
  const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-preview-05-20:default";
  const DEFAULT_SEARCH_MODEL = "sonar";
  const DEFAULT_INFERENCE_MODEL = "gemini-2.5-flash-preview-05-20:inference";
  const DEFAULT_SEARCH_INFERENCE_MODEL = "sonar-reasoning"

  const [model, setModel] = useState(DEFAULT_MODEL);
  const [modelType, setModelType] = useState("");
  const [alias, setAlias] = useState("");
  const [temperature, setTemperature] = useState(0.5);
  const [reason, setReason] = useState(2);
  const [systemMessage, setSystemMessage] = useState("");
  const [isImage, setIsImage] = useState(false);
  const [isSearch, setIsSearch] = useState(false);
  const [isInference, setIsInference] = useState(false);
  const [isDAN, setIsDAN] = useState(false);
  const [isSearchButton, setIsSearchButton] = useState(false);
  const [isInferenceButton, setIsInferenceButton] = useState(false);

  const updateModel = (newModel) => {
    setModel(newModel);

    const selectedModel = modelsData.models.find(m => m.model_name === newModel);
    const typeOfModel = selectedModel?.type || "";
    setModelType(typeOfModel);
    
    setIsInference(selectedModel?.inference);
    setIsSearch(selectedModel?.capabilities?.search);

    if (typeOfModel === "none") {
      setTemperature(1);
      setSystemMessage("");
      setIsDAN(false);
      setReason(0);
    } else if (typeOfModel === "reason") {
      setTemperature(1);
      setReason((prev) => (prev === 0 ? 2 : prev));
    } else if (typeOfModel === "think") {
      setTemperature(1);
      setReason(2);
    } else {
      setTemperature(0.5);
      setReason(0);
    }
  };

  useEffect(() => {
    updateModel(model);
    // eslint-disable-next-line
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        DEFAULT_MODEL,
        DEFAULT_IMAGE_MODEL,
        DEFAULT_SEARCH_MODEL,
        DEFAULT_INFERENCE_MODEL,
        DEFAULT_SEARCH_INFERENCE_MODEL,
        model,
        modelType,
        alias,
        temperature,
        reason,
        systemMessage,
        isImage,
        isInference,
        isSearch,
        isDAN,
        isSearchButton,
        isInferenceButton,
        updateModel,
        setAlias,
        setTemperature,
        setReason,
        setSystemMessage,
        setIsImage,
        setIsInference,
        setIsSearch,
        setIsDAN,
        setIsInferenceButton,
        setIsSearchButton
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};