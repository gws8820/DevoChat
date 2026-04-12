import React, { createContext, useState, useEffect, useMemo, useCallback } from "react";
 
export const SettingsContext = createContext();

const INIT_VALUES = {
  temperature: 1,
  reason: "medium",
  verbosity: "medium",
  memory: 4,
  instructions: "",
  isReasoning: false,
  isSearch: false,
  isDeepResearch: false
};

export const SettingsProvider = ({ children }) => {
  const [model, setModel] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [realtimeModel, setRealtimeModel] = useState("");
  const [models, setModels] = useState([]);
  const [imageModels, setImageModels] = useState([]);
  const [realtimeModels, setRealtimeModels] = useState([]);
  const [isModelReady, setIsModelReady] = useState(false);
  const [alias, setAlias] = useState("");
  const [temperature, setTemperature] = useState(INIT_VALUES.temperature);
  const [reason, setReason] = useState(INIT_VALUES.reason);
  const [verbosity, setVerbosity] = useState(INIT_VALUES.verbosity);
  const [defaultModel, setDefaultModel] = useState("");
  const [defaultImageModel, setDefaultImageModel] = useState("");
  const [memory, setMemory] = useState(INIT_VALUES.memory);
  const [instructions, setInstructions] = useState(INIT_VALUES.instructions);
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

  const applyModelSelection = (selectedModel, modelConfig = {}) => {
    if (!selectedModel) return;

    const temperatureControl = selectedModel?.controls?.temperature;
    const reasonLevels = Array.isArray(selectedModel?.controls?.reason) ? selectedModel.controls.reason : [];
    const verbosityLevels = Array.isArray(selectedModel?.controls?.verbosity) ? selectedModel.controls.verbosity : [];
    const canUseInstructions = Boolean(selectedModel?.controls?.instructions);
    const reasoningCapability = selectedModel?.capabilities?.reasoning;
    const searchCapability = selectedModel?.capabilities?.web_search;
    const deepResearchCapability = selectedModel?.capabilities?.deep_research;
    const visionCapability = selectedModel?.capabilities?.vision;
    const mcpCapability = selectedModel?.capabilities?.mcp;

    const canToggleReasoning = reasoningCapability === "toggle" || reasoningCapability === "switch";
    const canToggleSearch = searchCapability === "toggle" || searchCapability === "switch";
    const canToggleDeepResearch = deepResearchCapability === "toggle" || deepResearchCapability === "switch";

    const nextIsReasoning = canToggleReasoning
      ? modelConfig.isReasoning ?? isReasoning
      : Boolean(reasoningCapability);
    const nextIsSearch = canToggleSearch
      ? modelConfig.isSearch ?? isSearch
      : Boolean(searchCapability);
    const nextIsDeepResearch = canToggleDeepResearch
      ? modelConfig.isDeepResearch ?? isDeepResearch
      : Boolean(deepResearchCapability);

    setModel(selectedModel.model_name);
    setCanToggleReasoning(canToggleReasoning);
    setIsReasoning(nextIsReasoning);
    setCanToggleSearch(canToggleSearch);
    setIsSearch(nextIsSearch);
    setCanToggleDeepResearch(canToggleDeepResearch);
    setIsDeepResearch(nextIsDeepResearch);

    setCanControlTemp(temperatureControl === true || (temperatureControl === "conditional" && nextIsReasoning === false));
    setCanControlReason(reasonLevels.length > 0 && nextIsReasoning === true);
    setCanControlVerbosity(verbosityLevels.length > 0);

    if (reasonLevels.length > 0 && !reasonLevels.includes(reason)) {
      setReason(INIT_VALUES.reason);
    }
    if (verbosityLevels.length > 0 && !verbosityLevels.includes(verbosity)) {
      setVerbosity(INIT_VALUES.verbosity);
    }
    setCanControlSystemMessage(canUseInstructions);
    if (!canUseInstructions) setIsDAN(false);

    setCanVision(visionCapability === true || visionCapability === "switch");
    setCanToggleMCP(Boolean(mcpCapability));
    setMCPList(mcpCapability ? mcpList : []);
  };

  const applyImageModelSelection = (selectedImageModel) => {
    if (!selectedImageModel) return;

    const vision = selectedImageModel?.capabilities?.vision;
    const maxInput = selectedImageModel?.capabilities?.max_input;

    setImageModel(selectedImageModel.model_name);
    setCanVision(vision === "switch" || vision === true);
    setMaxImageInput(maxInput);
  };

  const updateModel = (newModel, modelConfig = {}) => {
    const selectedModel = models.find(m => m.model_name === newModel);
    applyModelSelection(selectedModel, modelConfig);
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
    setCanControlReason(Array.isArray(reason) && reason.length > 0 && nextIsReasoning === true);
  };

  const toggleSearch = () => {
    const selectedModel = models.find(m => m.model_name === model);
    const search = selectedModel?.capabilities?.web_search;
    const nextIsSearch = !isSearch;
    
    if (search === "switch") {
      const variants = selectedModel?.variants;
      const targetModel = isSearch ? variants?.base : variants?.web_search;
      if (targetModel) {
        updateModel(targetModel, {
          isReasoning,
          isSearch: nextIsSearch,
          isDeepResearch
        });
        return;
      }
    }
    
    setIsSearch(nextIsSearch);
  };

  const toggleDeepResearch = () => {
    const selectedModel = models.find(m => m.model_name === model);
    const deep_research = selectedModel?.capabilities?.deep_research;
    const nextIsDeepResearch = !isDeepResearch;
    
    if (deep_research === "switch") {
      const variants = selectedModel?.variants;
      const targetModel = isDeepResearch ? variants?.base : variants?.deep_research;
      if (targetModel) {
        updateModel(targetModel, {
          isReasoning,
          isSearch,
          isDeepResearch: nextIsDeepResearch
        });
        return;
      }
    }
    
    setIsDeepResearch(nextIsDeepResearch);
  };

  const updateImageModel = (newImageModel) => {
    const selectedImageModel = imageModels.find(m => m.model_name === newImageModel);
    applyImageModelSelection(selectedImageModel);
  };

  const updateRealtimeModel = useCallback((newRealtimeModel) => {
    setRealtimeModel(newRealtimeModel);
  }, []);

  const resetSettings = () => {
    if (defaultModel) {
      updateModel(defaultModel, INIT_VALUES);
    }

    if (defaultImageModel) {
      updateImageModel(defaultImageModel);
    }

    setTemperature(INIT_VALUES.temperature);
    setReason(INIT_VALUES.reason);
    setVerbosity(INIT_VALUES.verbosity);
    setMemory(INIT_VALUES.memory);
    setInstructions(INIT_VALUES.instructions);
    setIsDAN(false);
    setHasImage(false);
    setMCPList([]);
  };

  useEffect(() => {
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
        setDefaultModel(modelsData.default);
        setDefaultImageModel(imageModelsData.default);

        const selectedDefaultModel = modelsData?.models?.find(m => m.model_name === modelsData.default);
        const selectedDefaultImageModel = imageModelsData?.models?.find(m => m.model_name === imageModelsData.default);

        applyModelSelection(selectedDefaultModel);
        applyImageModelSelection(selectedDefaultImageModel);
        updateRealtimeModel(realtimeModelsData.default);
      } catch (error) {
        setModels([]);
        setImageModels([]);
        setRealtimeModels([]);
      } finally {
        setIsModelReady(true);
      }
    };

    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const value = useMemo(() => ({
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
    switchImageMode,
    resetSettings
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [models, imageModels, realtimeModels, model, imageModel, realtimeModel, isModelReady, alias, temperature, reason, verbosity, memory, instructions, hasImage, isReasoning, isSearch, isDeepResearch, isDAN, mcpList, canControlTemp, canControlReason, canControlVerbosity, canControlSystemMessage, canToggleReasoning, canToggleSearch, canToggleDeepResearch, canToggleMCP, canVision, maxImageInput]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};
