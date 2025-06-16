import {React, useState, useEffect, useRef} from "react";
import {useStateMachine} from "little-state-machine";
import {Link} from "react-router-dom";
import './theme.css';
import './HomePage.css';
import {languages, locale_text} from "./lang";

export function HomePage({setGlobalLanguage}) {
    const {actions, state} = useStateMachine({
        changeLanguage: (state, payload) => {
            console.log(state, payload)
            return ({...state, 'language': payload});
        }
    });

    const [currentLanguageState, setLanguageState] = useState(state['language']);
    const lang = currentLanguageState;

    // Handle clicks on logo and title
    const handleProjectLinkClick = () => {
        window.open('https://senseable.mit.edu/feeling-nature/', '_blank', 'noopener,noreferrer');
    };

    // FIXED: Enhanced floating dots effect with memory management
    useEffect(() => {
        const createFloatingDots = () => {
            const container = document.querySelector('.floating-dots-container');
            if (!container) return;

            // FIXED: Limit maximum dots to prevent memory issues
            const MAX_DOTS = 30; // Reduced from unlimited
            let activeDots = 0;
            let intervalIds = [];

            // Nature-inspired colors (same as before)
            const colors = [
                '#78a429', '#95C11F', '#A8D5A8', '#B8E6B8', '#87B987',
                '#9FCC9F', '#C8F7C8', '#6B8E23', '#8FBC8F', '#90EE90',
                '#98FB98', '#ADFF2F', '#7CFC00', '#00FF7F', '#00FA9A'
            ];

            const sizes = ['tiny', 'small', 'medium', 'large', 'extra-large'];

            const createDot = () => {
                // FIXED: Check limit before creating new dots
                if (activeDots >= MAX_DOTS) return;
                
                const dot = document.createElement('div');
                activeDots++; // Increment counter
                
                // Random size with weighted distribution (more small dots)
                const sizeRandom = Math.random();
                let sizeClass;
                if (sizeRandom < 0.4) sizeClass = 'tiny';
                else if (sizeRandom < 0.7) sizeClass = 'small';
                else if (sizeRandom < 0.85) sizeClass = 'medium';
                else if (sizeRandom < 0.95) sizeClass = 'large';
                else sizeClass = 'extra-large';

                dot.className = `floating-dot ${sizeClass}`;
                
                // Add pulse effect to some dots
                if (Math.random() < 0.1) {
                    dot.className += ' pulse';
                }
                
                // Random color
                const color = colors[Math.floor(Math.random() * colors.length)];
                dot.style.backgroundColor = color;
                
                // Random horizontal position
                const leftPos = Math.random() * 100;
                dot.style.left = leftPos + '%';
                
                // Random horizontal drift during animation
                const drift = (Math.random() - 0.5) * 200; // -100px to +100px
                dot.style.setProperty('--drift', drift + 'px');
                
                // Random animation duration (8-20 seconds) - REDUCED range
                const duration = 8 + Math.random() * 12;
                dot.style.animationDuration = duration + 's';
                
                // Random delay before starting
                const delay = Math.random() * 5; // REDUCED delay
                dot.style.animationDelay = delay + 's';
                
                // FIXED: Safe DOM manipulation
                if (container) {
                    container.appendChild(dot);
                }
                
                // FIXED: Enhanced cleanup with counter management
                const cleanup = () => {
                    if (container && dot && container.contains(dot)) {
                        try {
                            container.removeChild(dot);
                            activeDots--; // Decrement counter
                        } catch (error) {
                            // Silently handle removal errors
                            activeDots = Math.max(0, activeDots - 1);
                        }
                    }
                };

                setTimeout(cleanup, (duration + delay) * 1000);
            };

            // FIXED: Dramatically reduced dot creation frequency
            // Create initial dots (fewer than before)
            const initialDotCount = 15; // Reduced from 100
            for (let i = 0; i < initialDotCount; i++) {
                setTimeout(() => createDot(), i * 100); // Stagger creation
            }

            // FIXED: Much slower and fewer dot creation intervals
            // Create 1 dot every 3 seconds instead of 5 dots every 0.5 seconds
            intervalIds.push(setInterval(createDot, 3000));
            
            // Create additional dots occasionally
            intervalIds.push(setInterval(createDot, 5000));

            // FIXED: Enhanced cleanup function
            return () => {
                // Clear all intervals
                intervalIds.forEach(interval => clearInterval(interval));
                
                // Clear all dots safely
                if (container) {
                    try {
                        const dots = container.querySelectorAll('.floating-dot');
                        dots.forEach(dot => {
                            if (container.contains(dot)) {
                                container.removeChild(dot);
                            }
                        });
                        activeDots = 0; // Reset counter
                    } catch (error) {
                        // If container is already cleared, just reset counter
                        activeDots = 0;
                    }
                }
            };
        };

        const cleanup = createFloatingDots();
        return cleanup;
    }, []);

    return (
        <div className="page-container">
            {/* Floating dots container */}
            <div className="floating-dots-container"></div>
            
            {/* Header with title and language options */}
            <header className="header-container">
                {/* Main Title - Clickable */}
                <h1 className="main-title" onClick={handleProjectLinkClick}>
                    Feeling Nature Seoul
                </h1>
                
                {/* Language Navigation */}
                <nav>
                    <ul className="navbar">
                        {
                            Object.entries(languages).map(([key, value]) => {
                                const isSelected = (lang === value);
                                const isSelectedClass = isSelected ? "nav-li-selected" : "";
                                const targetLanguage = value;
                                const setLanguage = () => {
                                    actions.changeLanguage(targetLanguage);
                                    setLanguageState(targetLanguage);
                                    setGlobalLanguage(targetLanguage);
                                };

                                return (
                                    <li 
                                        key={value} 
                                        className={isSelectedClass}
                                        onClick={setLanguage}
                                    >
                                        <a>{key}</a>
                                    </li>
                                )
                            })
                        }
                    </ul>
                </nav>
            </header>

            {/* Header Logo - Independent element, same position as title, clickable */}
            <div className="header-logo" onClick={handleProjectLinkClick}>
                <img 
                    src="/FN-logo3.gif" 
                    alt="Senseable City Lab" 
                    className="header-logo-image"
                />
            </div>

            {/* Main content */}
            <div className="content-wrapper">
                <h2 className="subtitle">
                    {locale_text(lang, 'home-page-subtitle')}
                </h2>
                
                <p className="description-text">
                    {locale_text(lang, 'home-page-description')}
                </p>

                <Link to="/surveycity">
                    <button className="homepage-button">
                        {locale_text(lang, 'home-page-button-start-survey')}
                    </button>
                </Link>
            </div>

            {/* Footer with clickable logos */}
            <footer className="footer-container">
                <div className="logo-container">
                    <a 
                        href="https://senseable.mit.edu/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="footer-logo-link"
                    >
                        <img className="home-org-icon" src="/scl_logo.svg" alt="MIT" />
                    </a>
                    <a 
                        href="https://www.kaist.ac.kr/en/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="footer-logo-link"
                    >
                        <img className="home-org-icon" src="/org-kaist.svg" alt="KAIST" />
                    </a>
                </div>

                {/* New right corner logo */}
                <div className="footer-right-logo">
                    <a 
                        href="https://www.mit.edu/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="footer-right-logo-link"
                    >
                        <img className="right-corner-logo" src="/mit_logo.svg" alt="MIT Logo" />
                    </a>
                </div>
            </footer>
        </div>
    );
}