import {React, useState} from "react";
import {useStateMachine} from "little-state-machine";
import {Link, useParams} from "react-router-dom";
import './theme.css';
import './ThankYouPage.css';
import {DEFAULT_LANG, locale_text, locale_text_raw} from "./lang";
import axios from "axios";

const ReturnButton = (opts) => {
    return (<Link to="/">
        <button className="button-generic button-stick-to-center thankyou-button" {...opts}></button>
    </Link>)
};

const SubmitButton = (opts) => {
    return (<button className="button-generic button-stick-to-right thankyou-send-button" {...opts}></button>)
};

export function ThankYouPage() {
    const {surveyid} = useParams();
    const {state} = useStateMachine();
    const lang = state['language'] || DEFAULT_LANG;

    // Check if user is not eligible (answered "No" to residency)
    const isNotEligible = surveyid === 'not-eligible';

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState({ type: '', message: '' });
    const [isSuccessfullySubmitted, setIsSuccessfullySubmitted] = useState(false);

    // Form validation function
    const validateForm = () => {
        // Clear previous status
        setSubmitStatus({ type: '', message: '' });

        // Check if all fields are filled
        if (!name.trim()) {
            setSubmitStatus({
                type: 'error',
                message: lang === 'Korean' ? '이름을 입력해주세요.' : 'Please enter your name.'
            });
            return false;
        }

        if (!email.trim()) {
            setSubmitStatus({
                type: 'error',
                message: lang === 'Korean' ? '이메일을 입력해주세요.' : 'Please enter your email.'
            });
            return false;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            setSubmitStatus({
                type: 'error',
                message: lang === 'Korean' ? '올바른 이메일 형식을 입력해주세요.' : 'Please enter a valid email address.'
            });
            return false;
        }

        if (!message.trim()) {
            setSubmitStatus({
                type: 'error',
                message: lang === 'Korean' ? '메시지를 입력해주세요.' : 'Please enter your message.'
            });
            return false;
        }

        return true;
    };

    // Enhanced submission with success state management
    const submitContactInfo = async () => {
        // Validate form first
        if (!validateForm()) {
            return; // Stop if validation fails
        }

        // Prevent double submission
        if (isSubmitting) return;

        setIsSubmitting(true);

        try {
            const _data = {
                name: name.trim(),
                email: email.trim(), 
                message: message.trim()
            };
            const data = {};
            data[surveyid] = _data;

            console.log("🚀 Sending contact info:", data);
            
            const response = await axios.post('/api/contact', data);
            
            console.log("✅ SUCCESS - Full response object:", response);

            // Check for successful response
            if (response.status === 200 || response.status === 201) {
                // SUCCESS: Set success state and hide form
                setIsSuccessfullySubmitted(true);
                setSubmitStatus({ type: '', message: '' }); // Clear any error messages
                
            } else {
                throw new Error(`Unexpected status: ${response.status}`);
            }

        } catch (error) {
            console.error("❌ CAUGHT ERROR:", error);
            
            if (error.response) {
                // Check if this is actually a success disguised as an error
                if (error.response.status === 200 || error.response.data?.success === true) {
                    console.log("🔄 FALSE ALARM: This is actually a success!");
                    // SUCCESS: Set success state and hide form
                    setIsSuccessfullySubmitted(true);
                    setSubmitStatus({ type: '', message: '' });
                } else {
                    // FAILURE: Show error, keep form visible
                    setSubmitStatus({
                        type: 'error',
                        message: lang === 'Korean' 
                            ? `메시지 전송에 실패했습니다. 상태: ${error.response.status}. 다시 시도해주세요.`
                            : `Message failed to send. Status: ${error.response.status}. Please try again.`
                    });
                }
            } else if (error.request) {
                // FAILURE: Network error, keep form visible
                setSubmitStatus({
                    type: 'error',
                    message: lang === 'Korean' 
                        ? '네트워크 오류가 발생했습니다. 연결을 확인하고 다시 시도해주세요.'
                        : 'Network error - please check your connection and try again.'
                });
            } else {
                // FAILURE: Request setup error, keep form visible
                setSubmitStatus({
                    type: 'error',
                    message: lang === 'Korean' 
                        ? '메시지 전송에 실패했습니다. 다시 시도해주세요.'
                        : 'Message failed to send. Please try again.'
                });
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle not eligible case
    if (isNotEligible) {
        return (
            <div className="container-page-mid-root">
                <div>
                    <h1 className="title-text title-text-h1 thank-you-title-text-h1">
                        {locale_text(lang, 'thank-you-not-eligible-title')}
                    </h1>
                    <p className="thank-you-description-text">
                        {locale_text(lang, 'thank-you-not-eligible-description')}
                    </p>
                    <Link to="/">
                        <button className="button-generic button-stick-to-center thankyou-button">
                            {locale_text(lang, 'thank-you-button-start-again')}
                        </button>
                    </Link>
                </div>
            </div>
        );
    }

    // Regular thank you page
    return (<div className="container-page-mid-root">
        <div>
            <h1 className="title-text title-text-h1 thank-you-title-text-h1">
                {locale_text(lang, 'thank-you-title')}
            </h1>
        </div>
        
        <div>
            {/* Dynamic description text based on submission state */}
            <p className="thank-you-description-text">
                {isSuccessfullySubmitted ? (
                    // SUCCESS: Show success message instead of form description
                    lang === 'Korean' 
                        ? '메시지를 보내주셔서 감사합니다! 곧 연락드리겠습니다.'
                        : 'Thank you for your message! We will get back to you soon.'
                ) : (
                    // DEFAULT: Show form description
                    locale_text(lang, 'thank-you-form-description')
                )}
            </p>
            
            {/* Only show contact form if NOT successfully submitted */}
            {!isSuccessfullySubmitted && (
                <form 
                    onSubmit={(e) => e.preventDefault()} 
                    style={{position: 'relative', left: '-5px'}}
                >
                    <div className="thankyou-input-field">
                        <input 
                            type="text" 
                            placeholder={locale_text_raw(lang, 'thank-you-form-full-name')}
                            value={name} 
                            onChange={(e) => setName(e.target.value)}
                            disabled={isSubmitting}
                        />
                    </div>
                    <div className="thankyou-input-field">
                        <input 
                            type="text" 
                            placeholder={locale_text_raw(lang, 'thank-you-form-email')}
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={isSubmitting}
                        />
                    </div>
                    <div className="thankyou-input-field">
                        <textarea
                            placeholder={locale_text_raw(lang, 'thank-you-form-message')}
                            className="placeholder-text"
                            value={message} 
                            onChange={(e) => setMessage(e.target.value)}
                            disabled={isSubmitting}
                        />
                    </div>

                    {/* Error message display (only show if there's an error) */}
                    {submitStatus.type === 'error' && (
                        <div className="submit-status error">
                            {submitStatus.message}
                        </div>
                    )}

                    <button
                        type="button"
                        className={`button-generic button-stick-to-right thankyou-send-button ${isSubmitting ? 'submitting' : ''}`}
                        onClick={submitContactInfo}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            lang === 'Korean' ? '전송 중...' : 'Sending...'
                        ) : (
                            locale_text(lang, 'thank-you-form-submit-button')
                        )}
                    </button>
                </form>
            )}
        </div>
        

    </div>);
}