import {React} from "react";
import {useStateMachine} from "little-state-machine";
import {Link, useParams} from "react-router-dom";
import {useForm} from 'react-hook-form';
import {useNavigate} from 'react-router-dom';
import {CITY_LIST, generateSurveyID} from '../core/generateSurvey';
import './theme.css';
import './SurveyCitySelectPage.css';
import {DEFAULT_LANG, locale_text} from "./lang";

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

    // ENHANCED: Create options with larger touch areas
    const createRadioOption = (value, labelKey) => {
        const uniqueId = `seoulResidency-${value}`;
        
        // FIXED: Click handler that properly triggers react-hook-form
        const handleContainerClick = (e) => {
            e.preventDefault();
            const radioButton = document.getElementById(uniqueId);
            if (radioButton && !radioButton.checked) {
                radioButton.click(); // Use click() instead of setting checked directly
            }
        };

        return (
            <div 
                className="div-option-item"
                key={value}
                onClick={handleContainerClick}
                style={{ cursor: 'pointer' }}
            >
                <input
                    type="radio"
                    id={uniqueId}
                    value={value}
                    {...register('seoulResidency', { required: true })}
                />
                <label 
                    htmlFor={uniqueId}
                    // REMOVED: onClick preventDefault to allow normal label behavior
                >
                    {locale_text(lang, labelKey)}
                </label>
            </div>
        );
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <div className="survey-city-select-grid-container">
                {createRadioOption('yes', 'seoul-residency-yes')}
                {createRadioOption('no', 'seoul-residency-no')}
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