import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap } from "lucide-react";

export function GlobalAssistant() {
    const location = useLocation();
    const [bubbleVisible, setBubbleVisible] = useState(true);
    const [message, setMessage] = useState({ title: "", text: "" });

    // Ref to hold the timer so we can clear it on hover
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const startHideTimer = () => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
            setBubbleVisible(false);
        }, 5000);
    };

    const handleMouseEnter = () => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        setBubbleVisible(true);
    };

    const handleMouseLeave = () => {
        startHideTimer();
    };

    useEffect(() => {
        // Determine the message based on the current path
        let newTitle = "";
        let newText = "";

        switch (location.pathname) {
            case "/":
                newTitle = "Welcome to TEKUP AI 🤔";
                newText = "";
                break;
            case "/dashboard":
                newTitle = "Creation Hub 🛠️";
                newText = "Choose an action below to get started. You can generate a presentation, quiz, or diagram from your document!";
                break;
            case "/generate_from_doc":
                newTitle = "Document AI 📄";
                newText = "Upload your file to generate presentation.";
                break;
            case "/history":
                newTitle = "Your History 🗓️";
                newText = "View your previously generated documents and quizzes here.";
                break;
            default:
                // Hide if we don't have a specific message for this route, or show a generic one
                newTitle = "TEKUP AI 🤖";
                newText = "I'm here to help if you need anything!";
                break;
        }

        setMessage({ title: newTitle, text: newText });
        setBubbleVisible(true);
        startHideTimer();

        return () => {
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        };
    }, [location.pathname]);

    return (
        <div
            className="fixed bottom-10 right-10 z-50 flex items-end gap-4"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <AnimatePresence mode="wait">
                {bubbleVisible && (
                    <motion.div
                        key="assistant-bot-bubble"
                        initial={{ opacity: 0, x: 30, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 20, scale: 0.9 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className="relative max-w-[280px]"
                        style={{
                            background: "linear-gradient(135deg, hsl(var(--card)/0.95), hsl(var(--card)/0.85))",
                            border: "1px solid hsl(var(--primary)/0.3)",
                            borderRadius: "20px 20px 4px 20px",
                            padding: "18px 22px",
                            backdropFilter: "blur(20px)",
                            boxShadow: "0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px hsl(var(--primary)/0.1)",
                        }}
                    >
                        <p className="text-base font-bold text-foreground">
                            {message.title}
                        </p>
                        {message.text && (
                            <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                                {message.text}
                            </p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Avatar circle (always visible) */}
            <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.6, type: "spring", stiffness: 200 }}
                className="w-20 h-20 rounded-full flex-shrink-0 flex items-center justify-center shadow-2xl cursor-pointer"
                style={{
                    background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))",
                    boxShadow: "0 0 40px hsl(var(--primary)/0.5), 0 20px 40px rgba(0,0,0,0.4)",
                }}
            >
                <GraduationCap className="w-10 h-10 text-white" />
            </motion.div>
        </div>
    );
}
