import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function ExamSimulatorPage() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/exam/prompt", { replace: true }); }, [navigate]);
  return null;
}
