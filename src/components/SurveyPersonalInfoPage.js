//import {React} from "react";
import React from "react";
import {useStateMachine} from "little-state-machine";
import {Link, useNavigate, useParams} from "react-router-dom";
import {useForm} from 'react-hook-form';
import axios from 'axios';

import './theme.css';
import './SurveyPersonalInfoPage.css';
import {DEFAULT_LANG, locale_text} from "./lang";
import { tvState, getSessionId } from '../stateApi';


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

// ENHANCED: Radio Form Options with iPad-specific touch handling
const RadioFormOptions = (options, registerName, registerFunc, lang) => {
    const optionList = options.map((value, index) => {
        const labelLocaleText = lang ? locale_text(lang, `survey-personal-info-question-gender-option-${value}`) : value;
        const uniqueId = `${registerName}-${value}`;
        
        // FIXED: iPad-specific touch handler
        const handleTouchEnd = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const radioButton = document.getElementById(uniqueId);
            if (radioButton && !radioButton.checked) {
                // Force the radio button to be checked
                radioButton.checked = true;
                
                // Create and dispatch proper events for react-hook-form
                const changeEvent = new Event('change', { bubbles: true });
                const inputEvent = new Event('input', { bubbles: true });
                
                radioButton.dispatchEvent(changeEvent);
                radioButton.dispatchEvent(inputEvent);
                
                // Also trigger a focus event to ensure form validation
                radioButton.focus();
                radioButton.blur();
            }
        };

        const handleClick = (e) => {
            // For non-touch devices, let normal click work
            if (!('ontouchstart' in window)) {
                const radioButton = document.getElementById(uniqueId);
                if (radioButton && !radioButton.checked) {
                    radioButton.click();
                }
            }
        };
        
        return (
            <div 
                className="personal-info-grid-item" 
                key={`${registerName}-${index}`}
                onClick={handleClick}
                onTouchEnd={handleTouchEnd} // Add touch-specific handler
                style={{ cursor: 'pointer' }}
            >
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

    if (_data.language) {
        data_['/language'] = _data.language;
    }

    for (const [key, value] of Object.entries(_data)) {
        if (key.startsWith(id)) {
            const _key = key.substring(id.length);
            data_[_key] = value;
        }
    }
    const data = {};
    data[id] = data_;
    
    //console.log("=== SURVEY SUBMISSION START ===");
    //console.log("Survey ID:", id);
    //console.log("Sending survey data:", JSON.stringify(data, null, 2));
    //console.log("Request timestamp:", new Date().toISOString());
    
    // Send to backend with enhanced logging
    axios.post('/api/upload', data, {
        timeout: 30000, // 30 second timeout
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        //console.log("=== UPLOAD SUCCESS ===");
        //console.log("Response status:", response.status);
        //console.log("Response data:", response.data);
        //console.log("Response headers:", response.headers);
        //console.log("Upload completed at:", new Date().toISOString());
        
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
            //console.log("ResetPreviousState", state);
            return {};
        },
    });

    const lang = state['language'] || DEFAULT_LANG;

    const optionsAgeGroup = ["18-25", "26-40", "41-55", ">55"];
    const optionsGenderGroup = ["Male", "Female", "Other", "Prefer not to answer"];

    const sessionId = getSessionId();

    const buttonSubmitOnClick = handleSubmit((_data) => {
        // Map each key value pair in _data to a new variable data, with key adding prefix surveyID
        let data = {};
        for (const [key, value] of Object.entries(_data)) {
            data[`${surveyid}/${key}`] = value;
        }

        actions.simpleUpdate(data);
        //const sendingData = {...state, ...data};
        const sendingData = {
            language: state['language'] || DEFAULT_LANG,
            ...state, 
            ...data
        };

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

        // Tell TV1 to show the countdown overlay while backend recomputes
        tvState.countdown(sessionId, 3).catch(err => console.error('[tv] countdown failed', err));

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