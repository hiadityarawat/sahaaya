import { redirect } from "next/navigation";
import { chatGPTSignInPath } from "../chatgpt-auth";

export default function AuthPage() {
  redirect(chatGPTSignInPath("/"));
}
