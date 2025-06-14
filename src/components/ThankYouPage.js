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

    // Add debug line to see what's happening
    console.log("ThankYou Page - Current language:", lang, "Full state:", state);

    // Check if user is not eligible (answered "No" to residency)
    const isNotEligible = surveyid === 'not-eligible';

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");

    /*const submitContactInfo = () => {
        const _data = {
            name: name, 
            email: email, 
            message: message
        };
        const data = {};
        data[surveyid] = _data;
    
        console.log("Sending contact info:", data);
        
        // Send to backend instead of showing offline alert
        axios.post('/api/contact', data)
            .then(response => {
                console.log('Contact info sent successfully:', response.data);
                alert('Thank you for your message! We will get back to you soon.');
                // Clear the form
                setName("");
                setEmail("");
                setMessage("");
            })
            .catch(error => {
                console.error('Contact form submission failed:', error);
                alert('Message failed to send. Please try again.');
            });
    };*/
    const submitContactInfo = () => {
        const _data = {
            name: name, 
            email: email, 
            message: message
        };
        const data = {};
        data[surveyid] = _data;
    
        console.log("🚀 Sending contact info:", data);
        
        // Send to backend with detailed debugging
        axios.post('/api/contact', data)
            .then(response => {
                // SUCCESS CASE - Check what we're actually getting
                console.log("✅ SUCCESS - Full response object:", response);
                console.log("✅ Response status:", response.status);
                console.log("✅ Response data:", response.data);
                console.log("✅ Response headers:", response.headers);
                
                // Check if it's actually successful
                if (response.status === 200 || response.status === 201) {
                    alert('Thank you for your message! We will get back to you soon.');
                    // Clear the form
                    setName("");
                    setEmail("");
                    setMessage("");
                } else {
                    console.error("❌ Unexpected success status:", response.status);
                    alert(`Unexpected response status: ${response.status}`);
                }
            })
            .catch(error => {
                // ERROR CASE - Check what's really happening
                console.error("❌ CAUGHT ERROR:", error);
                console.error("❌ Error message:", error.message);
                console.error("❌ Error code:", error.code);
                
                if (error.response) {
                    // Server responded with error status
                    console.error("❌ Error response status:", error.response.status);
                    console.error("❌ Error response data:", error.response.data);
                    console.error("❌ Error response headers:", error.response.headers);
                    console.error("❌ Full error response:", error.response);
                    
                    // CHECK: Is this actually a success disguised as an error?
                    if (error.response.status === 200 || error.response.data?.success === true) {
                        console.log("🔄 FALSE ALARM: This is actually a success!");
                        alert('Thank you for your message! We will get back to you soon.');
                        setName("");
                        setEmail("");
                        setMessage("");
                    } else {
                        alert(`Message failed to send. Status: ${error.response.status}. Please try again.`);
                    }
                } else if (error.request) {
                    // Network error
                    console.error("❌ Network error - no response received:", error.request);
                    alert('Network error - please check your connection and try again.');
                } else {
                    // Request setup error
                    console.error("❌ Request setup error:", error.message);
                    alert('Message failed to send. Please try again.');
                }
            });
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

    // Regular thank you page (using original structure)
    return (<div className="container-page-mid-root">
        <div>
            <h1 className="title-text title-text-h1 thank-you-title-text-h1">
                {locale_text(lang, 'thank-you-title')}
            </h1>
        </div>
        <div>
            <p className="thank-you-description-text">
                {locale_text(lang, 'thank-you-form-description')}
            </p>
            <form style={{position: 'relative', left: '-5px'}}>
                <div className="thankyou-input-field">
                    <input 
                        type="text" 
                        placeholder={locale_text_raw(lang, 'thank-you-form-full-name')}
                        value={name} 
                        onChange={(e) => {setName(e.target.value)}}
                    />
                </div>
                <div className="thankyou-input-field">
                    <input 
                        type="email" 
                        placeholder={locale_text_raw(lang, 'thank-you-form-email')}
                        value={email} 
                        onChange={(e) => {setEmail(e.target.value)}}
                    />
                </div>
                <div className="thankyou-input-field">
                    <textarea
                        type="text"
                        placeholder={locale_text_raw(lang, 'thank-you-form-message')}
                        className="placeholder-text"
                        value={message} 
                        onChange={(e) => {setMessage(e.target.value)}}
                    />
                </div>
                <SubmitButton onClick={submitContactInfo}>
                    {locale_text(lang, 'thank-you-form-submit-button')}
                </SubmitButton>
            </form>
        </div>
    </div>);
}