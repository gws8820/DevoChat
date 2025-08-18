import React, { createContext, useState } from "react";

export const SettingsContext = createContext();

export const SettingsProvider = ({ children, modelsData }) => {
  const defaultModel = "gemini-2.5-flash";
  
  const [model, setModel] = useState(defaultModel);
  const [alias, setAlias] = useState("");
  const [temperature, setTemperature] = useState(0.5);
  const [reason, setReason] = useState(0.5);
  const [verbosity, setVerbosity] = useState(0.5);
  const [systemMessage, setSystemMessage] = useState("");
  const [isImage, setIsImage] = useState(false);
  const [isInference, setIsInference] = useState(false);
  const [isSearch, setIsSearch] = useState(false);
  const [isDeepResearch, setIsDeepResearch] = useState(false);
  const [isDAN, setIsDAN] = useState(false);
  const [mcpList, setMCPList] = useState([]);
  const [canReadImage, setCanReadImage] = useState(false);
  const [canControlTemp, setCanControlTemp] = useState(false);
  const [canControlReason, setCanControlReason] = useState(false);
  const [canControlVerbosity, setCanControlVerbosity] = useState(false);
  const [canControlSystemMessage, setCanControlSystemMessage] = useState(false);
  const [canToggleInference, setCanToggleInference] = useState(false);
  const [canToggleSearch, setCanToggleSearch] = useState(false);
  const [canToggleDeepResearch, setCanToggleDeepResearch] = useState(false);
  const [canToggleMCP, setCanToggleMCP] = useState(false);

  const updateModel = (newModel, initialSettings) => {
    const selectedModel = modelsData.models.find(m => m.model_name === newModel);
    setModel(newModel);
    
    const temperature = selectedModel?.controls?.temperature;
    const reason = selectedModel?.controls?.reason;
    const verbosity = selectedModel?.controls?.verbosity;
    const system_message = selectedModel?.controls?.system_message;
    const inference = selectedModel?.capabilities?.inference;
    const search = selectedModel?.capabilities?.search;
    const deep_research = selectedModel?.capabilities?.deep_research;
    const image = selectedModel?.capabilities?.image;
    const mcp = selectedModel?.capabilities?.mcp;

    let nextIsInference;

    if (inference === "toggle" || inference === "switch") {
      setCanToggleInference(true);
      if (initialSettings) {
        setIsInference(initialSettings.isInference);
        nextIsInference = initialSettings.isInference;
      } else {
        nextIsInference = isInference;
      }
    } else {
      setCanToggleInference(false);
      setIsInference(inference);
      nextIsInference = inference;
    }

    if (search === "toggle" || search === "switch") {
      setCanToggleSearch(true);
      if (initialSettings) {
        setIsSearch(initialSettings.isSearch);
      }
    } else {
      setCanToggleSearch(false);
      setIsSearch(search);
    }

    if (deep_research === "toggle" || deep_research === "switch") {
      setCanToggleDeepResearch(true);
      if (initialSettings) {
        setIsDeepResearch(initialSettings.isDeepResearch);
      }
    } else {
      setCanToggleDeepResearch(false);
      setIsDeepResearch(deep_research);
    }

    setCanControlTemp(temperature === true || temperature === "conditional");
    setCanControlReason(reason === true && nextIsInference === true);
    setCanControlVerbosity(verbosity === true);

    setCanControlSystemMessage(system_message);
    if (!system_message) {
      setSystemMessage("");
      setIsDAN(false);
    }

    setCanReadImage(image);
    setCanToggleMCP(mcp);
    setMCPList(mcp ? mcpList : []);
  };

  const toggleInference = () => {
    const selectedModel = modelsData.models.find(m => m.model_name === model);
    const inference = selectedModel?.capabilities?.inference;
    const temperature = selectedModel?.controls?.temperature;
    const reason = selectedModel?.controls?.reason;
    
    const nextIsInference = !isInference;

    if (inference === "switch") {
      const variants = selectedModel?.variants;
      const targetModel = nextIsInference ? variants?.inference : variants?.base;
      if (targetModel) {
        updateModel(targetModel);
      }
    } 

    setIsInference(nextIsInference);

    setCanControlTemp(temperature === true || temperature === "conditional");
    setCanControlReason(reason === true && nextIsInference === true);
  };

  const toggleSearch = () => {
    const selectedModel = modelsData.models.find(m => m.model_name === model);
    const search = selectedModel?.capabilities?.search;
    
    if (search === "switch") {
      const variants = selectedModel?.variants;
      const targetModel = isSearch ? variants?.base : variants?.search;
      if (targetModel) {
        updateModel(targetModel);
      }
    }
    
    setIsSearch(!isSearch);
  };

  const toggleDeepResearch = () => {
    const selectedModel = modelsData.models.find(m => m.model_name === model);
    const deep_research = selectedModel?.capabilities?.deep_research;
    
    if (deep_research === "switch") {
      const variants = selectedModel?.variants;
      const targetModel = isDeepResearch ? variants?.base : variants?.deep_research;
      if (targetModel) {
        updateModel(targetModel);
      }
    }
    
    setIsDeepResearch(!isDeepResearch);
  };

  return (
    <SettingsContext.Provider
      value={{
        modelsData,
        defaultModel,
        model,
        alias,
        temperature,
        reason,
        verbosity,
        systemMessage,
        isImage,
        isInference,
        isSearch,
        isDeepResearch,
        isDAN,
        mcpList,
        canReadImage,
        canControlTemp,
        canControlReason,
        canControlVerbosity,
        canControlSystemMessage,
        canToggleInference, 
        canToggleSearch,
        canToggleDeepResearch, 
        canToggleMCP,
        updateModel,
        setAlias,
        setTemperature,
        setReason,
        setVerbosity,
        setSystemMessage,
        setIsImage,
        setIsDAN,
        setMCPList,
        toggleInference,
        toggleSearch,
        toggleDeepResearch
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};