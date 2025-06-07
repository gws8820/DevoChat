import React, { createContext, useState, useEffect } from "react";
import modelsData from '../models.json';

export const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
  const DEFAULT_MODEL = "gemini-2.5-flash-preview-05-20";
  
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [sliderType, setSliderType] = useState("");
  const [alias, setAlias] = useState("");
  const [temperature, setTemperature] = useState(0.5);
  const [reason, setReason] = useState(2);
  const [systemMessage, setSystemMessage] = useState("");
  const [isImage, setIsImage] = useState(false);
  const [isSearch, setIsSearch] = useState(false);
  const [isInference, setIsInference] = useState(false);
  const [isDAN, setIsDAN] = useState(false);
  const [canEditSettings, setCanEditSettings] = useState(false);
  const [canToggleInference, setCanToggleInference] = useState(false);
  const [canToggleSearch, setCanToggleSearch] = useState(false);
  const [canReadImage, setCanReadImage] = useState(false);

  const updateModel = (newModel) => {
    const selectedModel = modelsData.models.find(m => m.model_name === newModel);
    const slider = selectedModel?.slider;
    const inference = selectedModel?.capabilities?.inference;
    const search = selectedModel?.capabilities?.search;
    const image = selectedModel?.capabilities?.image;

    setModel(newModel);
    setIsInference(inference === true);
    setIsSearch(search === true);
    setCanEditSettings(slider !== "none");
    setCanToggleInference(inference === "toggle");
    setCanToggleSearch(search === "toggle");
    setCanReadImage(image);
    
    if (slider === "none") {
      setTemperature(1);
      setReason(0);
      setSystemMessage("");
      setIsDAN(false);
      setSliderType("none");
    }
    else if (inference === false || inference === "toggle") {
      setTemperature(0.5);
      setReason(0);
      setSliderType("temperature");
    }
    else if (inference === true) {
      if (slider === "temperature") {
        setTemperature(0.5);
        setReason(0);
        setSliderType("temperature");
      }
      else if (slider === "fixed_reason") {
        setTemperature(1);
        setReason(2);
        setSliderType("temperature");
      }
      else if (slider === "reason") {
        setTemperature(1);
        setReason((prev) => (prev === 0 ? 2 : prev));
        setSliderType("reason");
      }
    }
  };

  useEffect(() => {
    updateModel(model);
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const selectedModel = modelsData.models.find(m => m.model_name === model);
    const slider = selectedModel?.slider;
    
    if (isInference) {
      if (slider === "fixed_reason") {
        setTemperature(1);
        setReason(2);
        setSliderType("temperature");
      }
      else if (slider === "reason") {
        setTemperature(1);
        setReason((prev) => (prev === 0 ? 2 : prev));
        setSliderType("reason");
      }
    }
    else {
      setTemperature(0.5);
      setReason(0);
      setSliderType("temperature");
    }
    // eslint-disable-next-line
  }, [isInference]);

  return (
    <SettingsContext.Provider
      value={{
        DEFAULT_MODEL,
        model,
        sliderType,
        alias,
        temperature,
        reason,
        systemMessage,
        isImage,
        isInference,
        isSearch,
        isDAN,
        canEditSettings,
        canToggleInference,
        canToggleSearch,
        canReadImage,
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