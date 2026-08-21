import Platform from "./Platform";
import Landing from "./Landing";
import { getChatGPTUser } from "./chatgpt-auth";

export const dynamic="force-dynamic";
export default async function Home(){
  const user=await getChatGPTUser();
  return user?<Platform/>:<Landing/>;
}
