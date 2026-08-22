import Platform from "./Platform";
import Landing from "./Landing";
import { sessionUser } from "../lib/user-auth";

export const dynamic="force-dynamic";
export default async function Home(){
  const user=await sessionUser().catch(()=>null);
  return user?<Platform/>:<Landing/>;
}
