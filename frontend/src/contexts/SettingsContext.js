import React, { createContext, useState, useEffect } from "react";
import axios from "../utils/axiosConfig";

export const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
  const [defaultModel, setDefaultModel] = useState("");
  const [defaultImageModel, setDefaultImageModel] = useState("");
  const [model, setModel] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [models, setModels] = useState([]);
  const [imageModels, setImageModels] = useState([]);
  const [isModelReady, setIsModelReady] = useState(false);
  const [alias, setAlias] = useState("");
  const [temperature, setTemperature] = useState(1);
  const [reason, setReason] = useState(0.5);
  const [verbosity, setVerbosity] = useState(0.5);
  const [systemMessage, setSystemMessage] = useState("");
  const [isInference, setIsInference] = useState(false);
  const [isSearch, setIsSearch] = useState(false);
  const [isDeepResearch, setIsDeepResearch] = useState(false);
  const [isDAN, setIsDAN] = useState(false);
  const [hasImage, setHasImage] = useState(false); // Has Image in Chat
  const [mcpList, setMCPList] = useState([]);
  const [canControlTemp, setCanControlTemp] = useState(false);
  const [canControlReason, setCanControlReason] = useState(false);
  const [canControlVerbosity, setCanControlVerbosity] = useState(false);
  const [canControlSystemMessage, setCanControlSystemMessage] = useState(false);
  const [canReadImage, setCanReadImage] = useState(false); // Can Read Image (Chat Mode)
  const [canEditImage, setCanEditImage] = useState(false); // Can Edit Image (Image Mode)
  const [canToggleInference, setCanToggleInference] = useState(false);
  const [canToggleSearch, setCanToggleSearch] = useState(false);
  const [canToggleDeepResearch, setCanToggleDeepResearch] = useState(false);
  const [canToggleMCP, setCanToggleMCP] = useState(false);
  const [maxImageInput, setMaxImageInput] = useState(1);

  const fetchModels = async () => {
    try {
      const [modelsResponse, imageModelsResponse] = await Promise.all([
        axios.get(`${process.env.REACT_APP_FASTAPI_URL}/models`, { withCredentials: true }),
        axios.get(`${process.env.REACT_APP_FASTAPI_URL}/image_models`, { withCredentials: true })
      ]);
      
      setModels(modelsResponse.data?.models);
      setImageModels(imageModelsResponse.data?.models);
      
      setDefaultModel(modelsResponse.data?.default);
      setDefaultImageModel(imageModelsResponse.data?.default);
    } catch (error) {
      setModels([]);
      setImageModels([]);
      
      setDefaultModel("");
      setDefaultImageModel("");
    } finally {
      setIsModelReady(true);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const updateModel = (newModel, initialSettings) => {
    const selectedModel = models.find(m => m.model_name === newModel);
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
    const selectedModel = models.find(m => m.model_name === model);
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
    const selectedModel = models.find(m => m.model_name === model);
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
    const selectedModel = models.find(m => m.model_name === model);
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

  const updateImageModel = (newImageModel) => {
    const selectedImageModel = imageModels.find(m => m.model_name === newImageModel);
    setImageModel(newImageModel);
    
    const imageConfig = selectedImageModel?.capabilities?.image;
    const type = imageConfig?.type;
    const maxInput = imageConfig?.max_input;
    
    setCanEditImage(type === "switch" || type === true);
    setMaxImageInput(maxInput);
  };

  const switchImageMode = (hasUploadedImages) => {
    const selectedImageModel = imageModels.find(m => m.model_name === imageModel);
    const imageConfig = selectedImageModel?.capabilities?.image;
    const type = imageConfig?.type;
    
    if (type === "switch") {
      const variants = selectedImageModel?.variants;
      if (hasUploadedImages) {
        const targetModel = variants?.image;
        if (targetModel) {
          updateImageModel(targetModel);
        }
      } else {
        const targetModel = variants?.base;
        if (targetModel) {
          updateImageModel(targetModel);
        }
      }
    }
  };

  return (
    <SettingsContext.Provider
      value={{
        defaultModel,
        defaultImageModel,
        isModelReady,
        models,
        imageModels,
        model,
        imageModel,
        alias,
        temperature,
        reason,
        verbosity,
        systemMessage,
        hasImage,
        isInference,
        isSearch,
        isDeepResearch,
        isDAN,
        mcpList,
        canControlTemp,
        canControlReason,
        canControlVerbosity,
        canControlSystemMessage,
        canEditImage,
        canToggleInference, 
        canToggleSearch,
        canToggleDeepResearch, 
        canToggleMCP,
        canReadImage,
        maxImageInput,
        updateModel,
        updateImageModel,
        setAlias,
        setTemperature,
        setReason,
        setVerbosity,
        setSystemMessage,
        setHasImage,
        setIsDAN,
        setMCPList,
        toggleInference,
        toggleSearch,
        toggleDeepResearch,
        switchImageMode
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};