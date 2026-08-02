import { useEffect, useState } from "react";
import { openMemberForm, type MemberFormSnapshot } from "./member-form-model";

export function useMemberFormModel(snapshot: MemberFormSnapshot) {
  const [model] = useState(() => openMemberForm(snapshot));

  useEffect(() => {
    return () => {
      model.close();
    };
  }, [model]);

  // One effect per collection, deliberately. Applying all four whenever any one
  // of them changes replays the *loaded* state over whatever the user has since
  // chosen: creating a workspace changes `projects`, and the assignments replay
  // that followed put the home workspace picker straight back to the first
  // option. Each collection is re-applied only when that collection changes.
  useEffect(() => {
    model.applyProjects(snapshot.projects);
  }, [model, snapshot.projects]);

  useEffect(() => {
    model.applyAssignments(snapshot.assignments);
  }, [model, snapshot.assignments]);

  useEffect(() => {
    model.applyTemplates(snapshot.templates);
  }, [model, snapshot.templates]);

  useEffect(() => {
    model.applyProviderEntries(snapshot.providerEntries);
  }, [model, snapshot.providerEntries]);

  return model;
}
