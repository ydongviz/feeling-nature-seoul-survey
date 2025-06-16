import {React, useState, useEffect} from "react";
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

    // Enhanced floating dots effect with 1000+ dots
    useEffect(() => {
        const createFloatingDots = () => {
            const container = document.querySelector('.floating-dots-container');
            if (!container) return;

            // More visible nature-inspired colors with better opacity
            const colors = [
                '#78a429', // Primary green (from your theme)
                '#95C11F', // Lighter primary green
                '#A8D5A8', // Soft green
                '#B8E6B8', // Light green
                '#87B987', // Medium green
                '#9FCC9F', // Soft medium green
                '#C8F7C8', // Very light green
                '#6B8E23', // Olive green
                '#8FBC8F', // Dark sea green
                '#90EE90', // Light green
                '#98FB98', // Pale green
                '#ADFF2F', // Green yellow
                '#7CFC00', // Lawn green
                '#00FF7F', // Spring green
                '#00FA9A'  // Medium spring green
            ];

            const sizes = ['tiny', 'small', 'medium', 'large', 'extra-large'];
            const dotPool = []; // Reuse dots for better performance

            const createDot = () => {
                const dot = document.createElement('div');
                
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
                
                // Random color with some transparency
                const color = colors[Math.floor(Math.random() * colors.length)];
                dot.style.backgroundColor = color;
                
                // Random horizontal position
                const leftPos = Math.random() * 100;
                dot.style.left = leftPos + '%';
                
                // Random horizontal drift during animation
                const drift = (Math.random() - 0.5) * 200; // -100px to +100px
                dot.style.setProperty('--drift', drift + 'px');
                
                // Random animation duration (5-25 seconds)
                const duration = 5 + Math.random() * 20;
                dot.style.animationDuration = duration + 's';
                
                // Random delay before starting
                const delay = Math.random() * 10;
                dot.style.animationDelay = delay + 's';
                
                container.appendChild(dot);
                
                // Remove dot after animation completes - Fixed to avoid React DOM errors
                setTimeout(() => {
                    if (container && dot && dot.parentNode === container) {
                        try {
                            container.removeChild(dot);
                        } catch (error) {
                            // Silently handle case where dot was already removed
                            console.log('Dot already removed or container changed');
                        }
                    }
                }, (duration + delay) * 1000);
            };

            // Create many initial dots immediately
            const initialDotCount = 100;
            for (let i = 0; i < initialDotCount; i++) {
                setTimeout(() => createDot(), i * 20); // Stagger creation slightly
            }

            // Continue creating dots very frequently
            const intervals = [];
            
            // Fast creation interval - many dots
            intervals.push(setInterval(() => {
                for (let i = 0; i < 5; i++) {
                    createDot();
                }
            }, 500)); // Every 0.5 seconds, create 5 dots

            // Medium creation interval
            intervals.push(setInterval(() => {
                for (let i = 0; i < 3; i++) {
                    createDot();
                }
            }, 1000)); // Every 1 second, create 3 dots

            // Slower creation interval for variety
            intervals.push(setInterval(() => {
                createDot();
            }, 200)); // Every 0.2 seconds, create 1 dot

            // Cleanup function - Enhanced to prevent React DOM errors
            return () => {
                intervals.forEach(interval => clearInterval(interval));
                if (container) {
                    // Clear all dots safely
                    try {
                        while (container.firstChild) {
                            container.removeChild(container.firstChild);
                        }
                    } catch (error) {
                        // If container is already cleared or unmounted, ignore error
                        console.log('Container already cleared');
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
                    <img className="right-corner-logo" src="/mit_logo.svg" alt="Left Logo" />
                    </a>
                </div>
                
            </footer>
        </div>
    );
}