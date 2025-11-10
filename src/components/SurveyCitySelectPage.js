import {React} from "react";
import {useStateMachine} from "little-state-machine";
//import {Link, useParams} from "react-router-dom";
import {useNavigate} from 'react-router-dom';
import {useForm} from 'react-hook-form';
import {useNavigate} from 'react-router-dom';
import {CITY_LIST, generateSurveyID} from '../core/generateSurvey';
import {generateSurveyID} from '../core/generateSurvey';
import './theme.css';
import './SurveyCitySelectPage.css';
import {DEFAULT_LANG, locale_text} from "./lang";


// Reusable Logo Component for all pages
const PageLogo = () => {
    return (
        <div className="global-page-logo">
            <a 
                href="https://senseable.mit.edu/feeling-nature/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="global-page-logo-link"
            >
                <img 
                    src="/fn-logo2.gif" 
                    alt="Feeling Nature" 
                    className="global-page-logo-image"
                />
            </a>
        </div>
    );
};


// Progress Bar Component
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

const SubmitButton = (opts) => {
    return (
        <button className="button-generic button-stick-to-right button-survey-select-submit" {...opts}>
            {opts.children}
        </button>
    )
};

const RadioForm = ({lang}) => {
    let navigate = useNavigate();

    const {
        register,
        handleSubmit,
        watch,
        formState: {isDirty, isValid}
    } = useForm();

    const onSubmit = (data) => {
        const answer = data.seoulResidency;
        
        if (answer === 'yes') {
            // Continue to survey - generate Seoul survey ID
            const surveyID = generateSurveyID('Seoul');
            navigate(`/survey/${surveyID}`);
        } else {
            // Go to thank you page (no survey ID needed for rejection)
            navigate('/thankyou/not-eligible');
        }
    };


    // ENHANCED: Create options with iPad-specific touch handling
    const createRadioOption = (value, labelKey) => {
        const uniqueId = `seoulResidency-${value}`;
        
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
                className="div-option-item"
                key={value}
                onClick={handleClick}
                onTouchEnd={handleTouchEnd} // Add touch-specific handler
                style={{ cursor: 'pointer' }}
            >
                <input
                    type="radio"
                    id={uniqueId}
                    value={value}
                    {...register('seoulResidency', { required: true })}
                />
                <label htmlFor={uniqueId}>
                    {locale_text(lang, labelKey)}
                </label>
            </div>
        );
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className="survey-city-select-grid-container">
                <div className="div-option-item">
                    <input
                        type="radio"
                        id="yes"
                        value="yes"
                        {...register('seoulResidency', { required: true })}
                    />
                    <label htmlFor="yes">
                        {locale_text(lang, 'seoul-residency-yes')}
                    </label>
                </div>
                
                <div className="div-option-item">
                    <input
                        type="radio"
                        id="no"
                        value="no"
                        {...register('seoulResidency', { required: true })}
                    />
                    <label htmlFor="no">
                        {locale_text(lang, 'seoul-residency-no')}
                    </label>
                </div>
            </div>

            <SubmitButton disabled={!isDirty || !isValid}>
                {locale_text(lang, 'survey-img-choice-submit-button')}
            </SubmitButton>
        </form>
    );
};

export function SurveyCitySelectPage() {
    const { state } = useStateMachine();
    const lang = state['language'] || DEFAULT_LANG;

    return (
        <div className="container-page-mid-root">
            {/* Progress Bar - Step 1 of 8 */}
            <ProgressBar currentStep={1} totalSteps={8} />
            
            {/* Question Title */}
            <h1 className="title-text city-select-title-text-h1">
                {locale_text(lang, 'seoul-residency-question')}
            </h1>
            
            {/* Description */}
            <div className="container-after-one-digit">
                <p className="description-text">
                    {locale_text(lang, 'seoul-residency-description')}
                </p>

                {/* Radio Form */}
                <RadioForm lang={lang} />
            </div>
        </div>
    );
}
