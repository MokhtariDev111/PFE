import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function PresentationsHub() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/generate_from_doc", { replace: true }); }, []);
  return null;
}
