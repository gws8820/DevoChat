import React, { createContext, useState, useEffect } from "react";
import modelsData from '../models.json';

export const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
  const DEFAULT_MODEL = "gemini-2.5-flash";
  
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [alias, setAlias] = useState("");
  const [temperature, setTemperature] = useState(0.5);
  const [reason, setReason] = useState(2);
  const [systemMessage, setSystemMessage] = useState("");
  const [isImage, setIsImage] = useState(false);
  const [isInference, setIsInference] = useState(false);
  const [isSearch, setIsSearch] = useState(false);
  const [isDAN, setIsDAN] = useState(false);
  const [canControlTemp, setCanControlTemp] = useState(false);
  const [canControlReason, setCanControlReason] = useState(false);
  const [canControlSystemMessage, setCanControlSystemMessage] = useState(false);
  const [canReadImage, setCanReadImage] = useState(false);
  const [canToggleInference, setCanToggleInference] = useState(false);
  const [canToggleSearch, setCanToggleSearch] = useState(false);

  const updateModel = (newModel) => {
    const selectedModel = modelsData.models.find(m => m.model_name === newModel);
    const temperature = selectedModel?.controls?.temperature;
    const reason = selectedModel?.controls?.reason;
    const system_message = selectedModel?.controls?.system_message;
    const inference = selectedModel?.capabilities?.inference;
    const search = selectedModel?.capabilities?.search;
    const image = selectedModel?.capabilities?.image;

    setModel(newModel);
    setIsInference(inference === true);
    setCanToggleInference(inference === "toggle");
    
    setIsSearch(search === true);
    setCanToggleSearch(search === "toggle");

    const defaultTempCondition = temperature === true || temperature === "conditional"; // No inference as default
    setCanControlTemp(defaultTempCondition);
    setTemperature(defaultTempCondition ? 0.5 : 1);

    const defaultReasonCondition = reason === true && inference === true; // For inference-only models
    setCanControlReason(defaultReasonCondition);
    setReason(defaultReasonCondition ? 2 : 0);

    setCanControlSystemMessage(system_message);
    if (!system_message) {
      setSystemMessage("");
      setIsDAN(false);
    }

    setCanReadImage(image);
  };

  useEffect(() => {
    updateModel(model);
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const selectedModel = modelsData.models.find(m => m.model_name === model);
    const temperature = selectedModel?.controls?.temperature;
    const reason = selectedModel?.controls?.reason;

    if (temperature === "conditional") {
      if(isInference) {
        setCanControlTemp(false);
        setTemperature(1);
      }
      else if(!isInference) {
        setCanControlTemp(true);
        setTemperature(0.5);
      }
    }

    if (reason) {
      if(isInference) {
        setCanControlReason(true);
        setReason(2);
      }
      else if(!isInference) {
        setCanControlReason(false);
        setReason(0);
      }
    }
    // eslint-disable-next-line
  }, [isInference]);

  return (
    <SettingsContext.Provider
      value={{
        DEFAULT_MODEL,
        model,
        alias,
        temperature,
        reason,
        systemMessage,
        isImage,
        isInference,
        isSearch,
        isDAN,
        canControlTemp,
        canControlReason,
        canControlSystemMessage,
        canReadImage,
        canToggleInference,
        canToggleSearch,
        updateModel,
        setAlias,
        setTemperature,
        setReason,
        setSystemMessage,
        setIsImage,
        setIsInference,
        setIsSearch,
        setIsDAN
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};