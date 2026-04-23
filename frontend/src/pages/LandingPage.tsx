import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { FeatureCards } from "@/components/landing/FeatureCards";
import { AnimatedProcess } from "@/components/landing/AnimatedProcess";
import { SocialProof } from "@/components/landing/SocialProof";
import { PanelPresentations } from "@/components/landing/StoryPanels/PanelPresentations";
import { PanelAria } from "@/components/landing/StoryPanels/PanelAria";
import { PanelQuiz } from "@/components/landing/StoryPanels/PanelQuiz";
import { PanelExam } from "@/components/landing/StoryPanels/PanelExam";
import { Vision } from "@/components/landing/Vision";
import { CtaBanner } from "@/components/landing/CtaBanner";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main>
        <Hero />
        <FeatureCards />
        <PanelPresentations />
        <PanelAria />
        <PanelQuiz />
        <PanelExam />
        <AnimatedProcess />
        <Vision />
        <SocialProof />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
}
