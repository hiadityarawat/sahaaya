import test from "node:test";
import assert from "node:assert/strict";
import { canManageRequest, canManageResources, canTransition, publicRequest } from "../src/policy.js";

test("request lifecycle permits only explicit forward transitions",()=>{assert.equal(canTransition("OPEN","ACCEPTED"),true);assert.equal(canTransition("OPEN","RESOLVED"),false);assert.equal(canTransition("RESOLVED","IN_PROGRESS"),false)});
test("request permissions include participants and administrators",()=>{const request={requester_id:"resident",accepted_by:"org",assigned_volunteer_id:"vol"};assert.equal(canManageRequest({id:"resident",role:"USER"},request),true);assert.equal(canManageRequest({id:"stranger",role:"USER"},request),false);assert.equal(canManageRequest({id:"admin",role:"ADMIN"},request),true)});
test("resource mutations are restricted to organizations and admins",()=>{assert.equal(canManageResources("USER"),false);assert.equal(canManageResources("VOLUNTEER"),false);assert.equal(canManageResources("ORGANIZATION"),true);assert.equal(canManageResources("ADMIN"),true)});
test("public request projection removes protected emergency data",()=>{const safe=publicRequest({id:"REQ-1",protected_location:"Exact house",protected_contact:"9999999999",public_area:"Whitefield"});assert.equal(safe.protected_location,undefined);assert.equal(safe.protected_contact,undefined);assert.equal(safe.public_area,"Whitefield")});
