import {React, useState} from "react";
import {useStateMachine} from "little-state-machine";
import {useNavigate, useParams} from "react-router-dom";
import './theme.css';
import './SurveyImgChoicePage.css';
import {decodeSurveyID} from "../core/generateSurvey";
import {DEFAULT_LANG, locale_text, locale_text_raw} from "./lang";

// Reusable Progress Bar Component (same as Q1)
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

// LITE: Simplified Image Component with Essential Optimization
const LiteOptimizedImage = ({ 
    src, 
    alt, 
    lang, 
    didImageLoaded, 
    className = "survey-image"
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    const handleImageLoad = () => {
        setIsLoading(false);
        setHasError(false);
        if (didImageLoaded) {
            didImageLoaded();
        }
    };

    const handleImageError = () => {
        console.error('Failed to load image:', src);
        setIsLoading(false);
        setHasError(true);
        if (didImageLoaded) {
            didImageLoaded(); // Prevent infinite waiting
        }
    };

    const retryLoad = () => {
        setHasError(false);
        setIsLoading(true);
        // Force reload by adding timestamp
        const imgElement = document.querySelector(`img[src*="${src}"]`);
        if (imgElement) {
            imgElement.src = src + '?retry=' + Date.now();
        }
    };

    return (
        <div className="lite-image-container">
            {/* Simple loading indicator */}
            {isLoading && (
                <div className="simple-loading">
                    <div className="simple-spinner"></div>
                    <p className="loading-text">
                        {lang ? locale_text(lang, 'survey-img-choice-loading-text') : 'Loading'} ...
                    </p>
                </div>
            )}

            {/* Simple error state with retry */}
            {hasError && (
                <div className="simple-error">
                    <p>Image failed to load</p>
                    <small className="error-path">{src}</small>
                    <button 
                        className="retry-button" 
                        onClick={retryLoad}
                        type="button"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Main image with native lazy loading */}
            <img
                src={src}
                alt={alt}
                className={className}
                style={{ 
                    display: (isLoading || hasError) ? 'none' : 'block',
                    opacity: isLoading ? 0 : 1,
                    transition: 'opacity 0.3s ease'
                }}
                onLoad={handleImageLoad}
                onError={handleImageError}
                loading="lazy" // Native browser lazy loading
                decoding="async" // Better performance
            />
        </div>
    );
};

// IMPROVED: Enhanced Image Choice Button Component
const ButtonImgPicker = ({ isDisabled, ...opts }) => {
    let className = "button-generic button-img-choice";
    const {isSelected, ...props} = opts;
    
    if (isSelected) {
        className += " button-generic-selected";
    }
    
    if (isDisabled) {
        className += " button-disabled";
    }
    
    return (
        <button 
            className={className} 
            disabled={isDisabled}
            type="button"
            {...props}
        />
    );
};

export function SurveyImgChoicePage() {
    const {surveyid} = useParams();
    const {city, surveyHash, imageSet} = decodeSurveyID(surveyid);

    const navigate = useNavigate();
    const {actions, state} = useStateMachine({
        simpleUpdate: (state, payload) => ({...state, ...payload})
    });
    const lang = state['language'] || DEFAULT_LANG;

    const [counter, setCounter] = useState(0);
    const [startTime, setStartTime] = useState(new Date());
    const [imagesLoaded, setImagesLoaded] = useState({ left: false, right: false });
    const [isSubmitting, setIsSubmitting] = useState(false);

    let [leftImagePath, rightImagePath] = imageSet[counter].map((value) => {
        // If it's already a full URL (starts with http), use as-is
        if (value.startsWith('http')) {
            return value;
        }
        // Otherwise, treat as local file path
        return `/images/${value}`;
    });
    
    // Field names for saving responses
    const formFieldCity = `${surveyid}/city`;
    const formFieldImageSelection = `${surveyid}/${counter}/selection`;
    const formFieldDuration = `${surveyid}/${counter}/duration`;
    const formFieldStartTime = `${surveyid}/${counter}/start_time`;
    const formFieldEndTime = `${surveyid}/${counter}/end_time`;
    const formFieldLeftImagePath = `${surveyid}/${counter}/left_image_path`;
    const formFieldRightImagePath = `${surveyid}/${counter}/right_image_path`;

    const MAX_COUNTER = 6;

    // IMPROVED: Better image loading tracking
    const handleImageLoaded = (side) => {
        setImagesLoaded(prev => ({
            ...prev,
            [side]: true
        }));
    };

    const bothImagesLoaded = imagesLoaded.left && imagesLoaded.right;

    // IMPROVED: Enhanced selection handler with loading state
    const handleSelection = async (side) => {
        if (isSubmitting || !bothImagesLoaded) return;
        
        setIsSubmitting(true);
        
        const now = new Date();
        let formDict = {};
        formDict[formFieldImageSelection] = side;
        formDict[formFieldDuration] = now - startTime;
        formDict[formFieldStartTime] = startTime;
        formDict[formFieldEndTime] = now;
        formDict[formFieldLeftImagePath] = leftImagePath;
        formDict[formFieldRightImagePath] = rightImagePath;
        formDict[formFieldCity] = city;
        actions.simpleUpdate(formDict);

        // Small delay for better UX
        await new Promise(resolve => setTimeout(resolve, 150));

        setStartTime(new Date());
        if (counter + 1 < MAX_COUNTER) {
            setCounter(counter + 1);
            setImagesLoaded({ left: false, right: false }); // Reset for next images
        } else {
            navigate(`/surveyinfo/${surveyid}`);
        }
        
        setIsSubmitting(false);
        window.scrollTo(0, 0);
    };

    // Calculate current step: Q1=1, Q2-Q7=2-7
    const currentStep = counter + 2;

    return (
        <div className="container-page-mid-root">
            {/* Progress Bar - Step 2-7 of 8 */}
            <ProgressBar currentStep={currentStep} totalSteps={8} />
            
            {/* Question Title */}
            <h1 className="title-text survey-image-title-text-h1">
                {currentStep} | {locale_text_raw(lang, 'survey-img-choice-title')}
            </h1>

            {/* IMPROVED: Image Comparison Grid with lite optimization */}
            <div className="grid-container-image-picker">
                <div className="grid-item-image-picker">
                    <LiteOptimizedImage
                        src={leftImagePath}
                        alt="left option"
                        lang={lang}
                        didImageLoaded={() => handleImageLoaded('left')}
                    />
                    <ButtonImgPicker
                        onClick={() => handleSelection('left')}
                        isDisabled={!bothImagesLoaded || isSubmitting}
                    >
                        {locale_text(lang, "survey-img-choice-button-left")}
                    </ButtonImgPicker>
                </div>
                
                <div className="grid-item-image-picker">
                    <LiteOptimizedImage
                        src={rightImagePath}
                        alt="right option"
                        lang={lang}
                        didImageLoaded={() => handleImageLoaded('right')}
                    />
                    <ButtonImgPicker
                        onClick={() => handleSelection('right')}
                        isDisabled={!bothImagesLoaded || isSubmitting}
                    >
                        {locale_text(lang, "survey-img-choice-button-right")}
                    </ButtonImgPicker>
                </div>
            </div>

            {/* ADDED: Simple loading indicator */}
            {!bothImagesLoaded && (
                <div className="images-loading-status">
                    <p>Loading images... {imagesLoaded.left ? '✓' : '○'} {imagesLoaded.right ? '✓' : '○'}</p>
                </div>
            )}
        </div>
    );
}