import {React} from "react";
import {useStateMachine} from "little-state-machine";
import {Link, useNavigate, useParams} from "react-router-dom";
import {useForm} from 'react-hook-form';
import axios from 'axios';

import './theme.css';
import './SurveyPersonalInfoPage.css';
import {DEFAULT_LANG, locale_text} from "./lang";

// Reusable Progress Bar Component (same as other pages)
const ProgressBar = ({ currentStep, totalSteps }) => {
    return (
        <div className="progress-bar-container">
            {Array.from({ length: totalSteps }, (_, index) => (
                <div
                    key={index}
                    className={`progress-segment ${index < currentStep ? 'active' : 'inactive'}`}
                />
            ))}
        </div>
    );
};

// Radio Form Options with hover effects
const RadioFormOptions = (options, registerName, registerFunc, lang) => {
    const optionList = options.map((value, index) => {
        const labelLocaleText = lang ? locale_text(lang, `survey-personal-info-question-gender-option-${value}`) : value;
        const uniqueId = `${registerName}-${value}`;
        
        return (
            <div className="personal-info-grid-item" key={`${registerName}-${index}`}>
                <input 
                    className="radio-item"
                    type="radio"
                    id={uniqueId}
                    value={value}
                    {...registerFunc(registerName, {required: true})}
                />
                <label htmlFor={uniqueId}>
                    {labelLocaleText}
                </label>
            </div>
        );
    });

    return (<div className="personal-info-grid-container">{optionList}</div>);
};

// Submit Button using global styles
const SubmitButton = (opts) => {
    return (
        <button 
            className="button-generic button-stick-to-right-and-a-little-more personal-info-submit-button" 
            {...opts}
        />
    );
};

function sendSurveyData(id, _data, success) {
    // Prepare data for backend
    const data_ = {};
    for (const [key, value] of Object.entries(_data)) {
        if (key.startsWith(id)) {
            const _key = key.substring(id.length);
            data_[_key] = value;
        }
    }
    const data = {};
    data[id] = data_;
    
    console.log("=== SURVEY SUBMISSION START ===");
    console.log("Survey ID:", id);
    console.log("Sending survey data:", JSON.stringify(data, null, 2));
    console.log("Request timestamp:", new Date().toISOString());
    
    // Send to backend with enhanced logging
    axios.post('/api/upload', data, {
        timeout: 30000, // 30 second timeout
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        console.log("=== UPLOAD SUCCESS ===");
        console.log("Response status:", response.status);
        console.log("Response data:", response.data);
        console.log("Response headers:", response.headers);
        console.log("Upload completed at:", new Date().toISOString());
        
        // Always call success callback - let the user experience be smooth
        success();
    })
    .catch(error => {
        console.error("=== UPLOAD ERROR ===");
        console.error("Error message:", error.message);
        console.error("Error code:", error.code);
        
        if (error.response) {
            console.error("Error response status:", error.response.status);
            console.error("Error response data:", error.response.data);
            console.error("Error response headers:", error.response.headers);
        } else if (error.request) {
            console.error("No response received:", error.request);
        } else {
            console.error("Request setup error:", error.message);
        }
        
        console.error("Error occurred at:", new Date().toISOString());
        console.log("=== END ERROR LOG ===");
        
        // Still call success callback to not break user flow
        // You can monitor the console logs to track actual failures
        success();
    });
}

export function SurveyPersonalInfoPage() {
    const {
        register, handleSubmit, watch,
        formState: {isDirty, isValid}
    } = useForm();

    const {surveyid} = useParams();
    const navigate = useNavigate();

    // Use state machine
    const {actions, state} = useStateMachine({
        simpleUpdate: (state, payload) => ({...state, ...payload}), 
        resetStateMachine: (state, payload) => {
            console.log("ResetPreviousState", state);
            return {};
        },
    });

    const lang = state['language'] || DEFAULT_LANG;

    const optionsAgeGroup = ["18-25", "26-40", "41-55", ">55"];
    const optionsGenderGroup = ["Male", "Female", "Other", "Prefer not to answer"];

    const buttonSubmitOnClick = handleSubmit((_data) => {
        // Map each key value pair in _data to a new variable data, with key adding prefix surveyID
        let data = {};
        for (const [key, value] of Object.entries(_data)) {
            data[`${surveyid}/${key}`] = value;
        }

        actions.simpleUpdate(data);
        const sendingData = {...state, ...data};

        // Send the request to the backend endpoint using axios with POST /survey
        //const success = actions.resetStateMachine;

          // Create a custom success function that preserves language
        const success = () => {
        // Reset survey data but keep language
           const currentLang = state['language'];
           actions.resetStateMachine();
            if (currentLang) {
              actions.simpleUpdate({ language: currentLang });
           }
        };
        
        sendSurveyData(surveyid, sendingData, success);
        navigate(`/thankyou/${surveyid}`);
    });

    return (
        <div className="container-page-mid-root">
            {/* Progress Bar - Step 8 of 8 */}
            <ProgressBar currentStep={8} totalSteps={8} />

            {/* Q8: Age Group */}
            <div className="container-section">
                <h1 className="title-text personal-info-title-text-h1">
                    {locale_text(lang, "survey-personal-info-question-age")}
                </h1>
                <div className="container-after-two-digit">
                    {RadioFormOptions(optionsAgeGroup, 'ageGroup', register, null)}
                </div>
            </div>

            {/* Q9: Gender */}
            <div className="container-section">
                <h1 className="title-text personal-info-title-text-h1">
                    {locale_text(lang, "survey-personal-info-question-gender")}
                </h1>
                <div className="container-after-two-digit">
                    {RadioFormOptions(optionsGenderGroup, 'genderGroup', register, lang)}
                </div>
            </div>

            {/* Submit Button */}
            <SubmitButton
                disabled={!isDirty || !isValid}
                onClick={buttonSubmitOnClick}
            >
                {locale_text(lang, "survey-personal-info-submit-button")}
            </SubmitButton>
        </div>
    );
}