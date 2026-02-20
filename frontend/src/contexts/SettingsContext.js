import React, { createContext, useState, useEffect } from "react";
 
export const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
  const [model, setModel] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [realtimeModel, setRealtimeModel] = useState("");
  const [models, setModels] = useState([]);
  const [imageModels, setImageModels] = useState([]);
  const [realtimeModels, setRealtimeModels] = useState([]);
  const [isModelReady, setIsModelReady] = useState(false);
  const [alias, setAlias] = useState("");
  const [temperature, setTemperature] = useState(1);
  const [reason, setReason] = useState(0.5);
  const [verbosity, setVerbosity] = useState(0.5);
  const [memory, setMemory] = useState(4);
  const [instructions, setInstructions] = useState("");
  const [isReasoning, setIsReasoning] = useState(false);
  const [isSearch, setIsSearch] = useState(false);
  const [isDeepResearch, setIsDeepResearch] = useState(false);
  const [isDAN, setIsDAN] = useState(false);
  const [hasImage, setHasImage] = useState(false); // Has Image in Chat
  const [mcpList, setMCPList] = useState([]);
  const [canControlTemp, setCanControlTemp] = useState(false);
  const [canControlReason, setCanControlReason] = useState(false);
  const [canControlVerbosity, setCanControlVerbosity] = useState(false);
  const [canControlSystemMessage, setCanControlSystemMessage] = useState(false);
  const [canVision, setCanVision] = useState(false);
  const [canToggleReasoning, setCanToggleReasoning] = useState(false);
  const [canToggleSearch, setCanToggleSearch] = useState(false);
  const [canToggleDeepResearch, setCanToggleDeepResearch] = useState(false);
  const [canToggleMCP, setCanToggleMCP] = useState(false);
  const [maxImageInput, setMaxImageInput] = useState(1);

  const fetchModels = async () => {
    try {
      const [modelsRes, imageModelsRes, realtimeModelsRes] = await Promise.all([
        fetch(`${process.env.REACT_APP_FASTAPI_URL}/chat_models`, { credentials: "include" }),
        fetch(`${process.env.REACT_APP_FASTAPI_URL}/image_models`, { credentials: "include" }),
        fetch(`${process.env.REACT_APP_FASTAPI_URL}/realtime_models`, { credentials: "include" })
      ]);
      if (!modelsRes.ok || !imageModelsRes.ok || !realtimeModelsRes.ok) {
        setModels([]);
        setImageModels([]);
        setRealtimeModels([]);
        return;
      }

      const modelsData = await modelsRes.json();
      const imageModelsData = await imageModelsRes.json();
      const realtimeModelsData = await realtimeModelsRes.json();

      setModels(modelsData?.models);
      setImageModels(imageModelsData?.models);
      setRealtimeModels(realtimeModelsData?.models);

      updateModel(modelsData.default, null, modelsData.models);
      updateImageModel(imageModelsData.default, imageModelsData.models);
      updateRealtimeModel(realtimeModelsData.default, realtimeModelsData.models);

    } catch (error) {
      setModels([]);
      setImageModels([]);
      setRealtimeModels([]);
    } finally {
      setIsModelReady(true);
    }
  };

  useEffect(() => {
    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateModel = (newModel, modelConfig, initialModelsList) => {
    const modelsArray = initialModelsList || models;
    const selectedModel = modelsArray.find(m => m.model_name === newModel);
    setModel(newModel);
    
    const temperature = selectedModel?.controls?.temperature;
    const reason = selectedModel?.controls?.reason;
    const verbosity = selectedModel?.controls?.verbosity;
    const instructions = selectedModel?.controls?.instructions;
    const reasoning = selectedModel?.capabilities?.reasoning;
    const search = selectedModel?.capabilities?.search;
    const deep_research = selectedModel?.capabilities?.deep_research;
    const vision = selectedModel?.capabilities?.vision;
    const mcp = selectedModel?.capabilities?.mcp;

    let nextIsReasoning;

    if (reasoning === "toggle" || reasoning === "switch") {
      setCanToggleReasoning(true);
      if (modelConfig) {
        setIsReasoning(modelConfig.isReasoning);
        nextIsReasoning = modelConfig.isReasoning;
      } else {
        nextIsReasoning = isReasoning;
      }
    } else {
      setCanToggleReasoning(false);
      setIsReasoning(reasoning);
      nextIsReasoning = reasoning;
    }

    if (search === "toggle" || search === "switch") {
      setCanToggleSearch(true);
      if (modelConfig) {
        setIsSearch(modelConfig.isSearch);
      }
    } else {
      setCanToggleSearch(false);
      setIsSearch(search);
    }

    if (deep_research === "toggle" || deep_research === "switch") {
      setCanToggleDeepResearch(true);
      if (modelConfig) {
        setIsDeepResearch(modelConfig.isDeepResearch);
      }
    } else {
      setCanToggleDeepResearch(false);
      setIsDeepResearch(deep_research);
    }

    setCanControlTemp(temperature === true || (temperature === "conditional" && nextIsReasoning === false));
    setCanControlReason(reason === true && nextIsReasoning === true);
    setCanControlVerbosity(verbosity === true);

    setCanControlSystemMessage(instructions);
    if (!instructions) setIsDAN(false);

    setCanVision(vision);
    setCanToggleMCP(mcp);
    setMCPList(mcp ? mcpList : []);
  };

  const toggleReasoning = () => {
    const selectedModel = models.find(m => m.model_name === model);
    const reasoning = selectedModel?.capabilities?.reasoning;
    const temperature = selectedModel?.controls?.temperature;
    const reason = selectedModel?.controls?.reason;

    const nextIsReasoning = !isReasoning;

    if (reasoning === "switch") {
      const variants = selectedModel?.variants;
      const targetModel = nextIsReasoning ? variants?.reasoning : variants?.base;
      if (targetModel) {
        updateModel(
          targetModel,
          {
            isReasoning: nextIsReasoning,
            isSearch,
            isDeepResearch
          }
        );
        return;
      }
    }

    setIsReasoning(nextIsReasoning);

    setCanControlTemp(temperature === true || (temperature === "conditional" && !nextIsReasoning));
    setCanControlReason(reason === true && nextIsReasoning === true);
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

  const updateImageModel = (newImageModel, initialImageModelsList) => {
    const imageModelsArray = initialImageModelsList || imageModels;
    const selectedImageModel = imageModelsArray.find(m => m.model_name === newImageModel);
    setImageModel(newImageModel);
    
    const vision = selectedImageModel?.capabilities?.vision;
    const maxInput = selectedImageModel?.capabilities?.max_input;
    
    setCanVision(vision === "switch" || vision === true);
    setMaxImageInput(maxInput);
  };

  const updateRealtimeModel = (newRealtimeModel, initialRealtimeModelsList) => {
    setRealtimeModel(newRealtimeModel);
  };

  const switchImageMode = (hasUploadedImages) => {
    const selectedImageModel = imageModels.find(m => m.model_name === imageModel);
    const vision = selectedImageModel?.capabilities?.vision;
    
    if (vision === "switch") {
      const variants = selectedImageModel?.variants;
      if (hasUploadedImages) {
        const targetModel = variants?.vision;
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
        models,
        imageModels,
        realtimeModels,
        model,
        imageModel,
        realtimeModel,
        isModelReady,
        alias,
        temperature,
        reason,
        verbosity,
        memory,
        instructions,
        hasImage,
        isReasoning,
        isSearch,
        isDeepResearch,
        isDAN,
        mcpList,
        canControlTemp,
        canControlReason,
        canControlVerbosity,
        canControlSystemMessage,
        canToggleReasoning,
        canToggleSearch,
        canToggleDeepResearch,
        canToggleMCP,
        canVision,
        maxImageInput,
        updateModel,
        updateImageModel,
        updateRealtimeModel,
        setAlias,
        setTemperature,
        setReason,
        setVerbosity,
        setMemory,
        setInstructions,
        setHasImage,
        setIsDAN,
        setMCPList,
        toggleReasoning,
        toggleSearch,
        toggleDeepResearch,
        switchImageMode
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};