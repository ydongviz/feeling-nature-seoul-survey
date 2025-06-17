import {React, useState, useEffect} from "react";
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

// Image Component
const Image = (opts) => {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    
    // Extract custom props that shouldn't go to DOM
    const {
        shouldSetGrey, 
        shouldImageDisplayed, 
        didImageLoaded,
        lang,
        ...imgProps  // Only pass standard img props to DOM
    } = opts;
    
    const handleImageLoaded = () => {
        setIsLoading(false);
        if (didImageLoaded) {
            didImageLoaded();
        }
    };

    const handleImageError = () => {
        setIsLoading(false);
        setHasError(true);
        console.error('Failed to load image:', imgProps.src);
        // Still call didImageLoaded to prevent infinite loading
        if (didImageLoaded) {
            didImageLoaded();
        }
    };

    let className = "survey-image";
    if (shouldSetGrey) {
        className += " survey-image-grey";
    }

    return (
        <div>
            {isLoading && (!shouldImageDisplayed || shouldImageDisplayed()) && (
                <div className="spinner">
                    {locale_text(lang, 'survey-img-choice-loading-text')} ...
                </div>
            )}
            
            {hasError && (
                <div style={{
                    width: '400px', 
                    height: '300px', 
                    backgroundColor: '#f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px dashed #ccc',
                    color: '#666',
                    borderRadius: '8px'
                }}>
                    Image not found<br/>
                    <small>{imgProps.src}</small>
                </div>
            )}
            
            <img
                {...imgProps}  // Only standard props (src, alt, etc.)
                className={className}
                style={{display: (isLoading || hasError) ? 'none' : 'block'}}
                onLoad={handleImageLoaded}
                onError={handleImageError}
            />
        </div>
    );
};

// Custom hook to detect mobile view
const useIsMobile = () => {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkIsMobile = () => {
            // Consider mobile if width is less than 768px (typical tablet/mobile breakpoint)
            setIsMobile(window.innerWidth < 768);
        };

        // Check on mount
        checkIsMobile();

        // Add event listener for window resize
        window.addEventListener('resize', checkIsMobile);

        // Cleanup
        return () => window.removeEventListener('resize', checkIsMobile);
    }, []);

    return isMobile;
};

// Image Choice Button Component with responsive labels
const ButtonImgPicker = ({ isSelected, position, lang, onClick, ...props }) => {
    const isMobile = useIsMobile();
    
    let className = "button-generic button-img-choice";
    if (isSelected) {
        className += " button-generic-selected";
    }

    // Determine button text based on screen size
    const getButtonText = () => {
        if (isMobile) {
            // Mobile view: use Top/Bottom
            return position === 'left' 
                ? locale_text(lang, "survey-img-choice-button-top")
                : locale_text(lang, "survey-img-choice-button-bottom");
        } else {
            // Desktop view: use Left/Right
            return position === 'left'
                ? locale_text(lang, "survey-img-choice-button-left")
                : locale_text(lang, "survey-img-choice-button-right");
        }
    };

    return (
        <button 
            className={className} 
            onClick={onClick}
            {...props}
        >
            {getButtonText()}
        </button>
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

    let [leftImagePath, rightImagePath] = imageSet[counter].map((value) => {
        // If it's already a full URL (starts with http), use as-is
        if (value.startsWith('http')) {
            return value;
        }
        // Otherwise, treat as local file path
        return `/images/${value}`;
    });
    
    //console.log('Loading images:', leftImagePath, rightImagePath); 

    // Field names for saving responses
    const formFieldCity = `${surveyid}/city`;
    const formFieldImageSelection = `${surveyid}/${counter}/selection`;
    const formFieldDuration = `${surveyid}/${counter}/duration`;
    const formFieldStartTime = `${surveyid}/${counter}/start_time`;
    const formFieldEndTime = `${surveyid}/${counter}/end_time`;
    const formFieldLeftImagePath = `${surveyid}/${counter}/left_image_path`;
    const formFieldRightImagePath = `${surveyid}/${counter}/right_image_path`;

    const MAX_COUNTER = 6;

    let [isLeftImageLoaded, setLeftImageLoaded] = useState(false);
    let [isRightImageLoaded, setRightImageLoaded] = useState(false);

    const didLeftImageLoaded = () => setLeftImageLoaded(true);
    const didRightImageLoaded = () => setRightImageLoaded(true);
    const shouldImageDisplayed = () => isLeftImageLoaded && isRightImageLoaded;

    const handleSelection = (side) => {
        const now = new Date();
        let formDict = {};
        // IMPORTANT: Still record 'left' or 'right' regardless of button label
        formDict[formFieldImageSelection] = side;
        formDict[formFieldDuration] = now - startTime;
        formDict[formFieldStartTime] = startTime;
        formDict[formFieldEndTime] = now;
        formDict[formFieldLeftImagePath] = leftImagePath;
        formDict[formFieldRightImagePath] = rightImagePath;
        formDict[formFieldCity] = city;
        actions.simpleUpdate(formDict);

        setStartTime(new Date());
        if (counter + 1 < MAX_COUNTER) {
            setCounter(counter + 1);
        } else {
            navigate(`/surveyinfo/${surveyid}`);
        }
        setLeftImageLoaded(false);
        setRightImageLoaded(false);
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

            {/* Image Comparison Grid */}
            <div className="grid-container-image-picker">
                <div className="grid-item-image-picker">
                    <Image
                        src={leftImagePath}
                        alt="left"
                        lang={lang}
                        didImageLoaded={didLeftImageLoaded}
                        shouldImageDisplayed={shouldImageDisplayed}
                    />
                    <ButtonImgPicker
                        position="left"
                        lang={lang}
                        onClick={() => handleSelection('left')} // Still records 'left'
                    />
                </div>
                <div className="grid-item-image-picker">
                    <Image
                        src={rightImagePath}
                        alt="right"
                        lang={lang}
                        didImageLoaded={didRightImageLoaded}
                        shouldImageDisplayed={shouldImageDisplayed}
                    />
                    <ButtonImgPicker
                        position="right"
                        lang={lang}
                        onClick={() => handleSelection('right')} // Still records 'right'
                    />
                </div>
            </div>
        </div>
    );
}