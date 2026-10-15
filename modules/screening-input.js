// The current providers receive a name and the supported structured fields.
// Never imply that a passport pasted into the name was checked as an identifier.
export function screeningInputIssue(query = {}) {
  const registration=String(query.registrationNumber||'').trim();
  if(query.type==='entity'&&registration&&(registration.includes(',')||!/[\p{L}\p{N}]/u.test(registration)))return {
    code:'invalid_company_number',field:'registrationNumber',
    title:'Correct the company number and repeat this search',
    message:'The supplied company number is not valid for structured matching. Correct it or leave the optional field empty and repeat the check.',
    formMessage:registration.includes(',')?'Enter one registration number without commas.':'Enter a company registration number containing at least one letter or number.',
    next:'Compare the registration number and jurisdiction with a registry extract, then start a new check. The original evidence will remain in History.'
  };
  const name=String(query.name||'');
  const marker=/(?:^|[\s,(;])passport(?:\s+(?:number|no\.?)|\s*[:#]|(?=\s+\d))\s*[:#]?\s*([a-z0-9][a-z0-9 -]*)/i.exec(name);
  if(!marker||!/[0-9]/.test(marker[1]))return null;
  const suggestedName=name.slice(0,marker.index).replace(/[\s,(;]+$/,'').trim();
  return {
    code:'passport_in_name',suggestedName,
    title:'Correct the name and repeat this search',
    message:'Passport text was included in the name field. It was not checked as a separate passport identifier. The returned results cannot reliably rule out a name match.',
    formMessage:'Enter only the person’s name here. Use the separate passport-number, date-of-birth and country fields.',
    next:'Remove the passport text from the name, keep the identifying details in their own fields, and start a new check. The original evidence will remain in History.'
  };
}

export function identityNextStep(query = {}) {
  if(query.type==='entity')return 'Compare the company registration number and jurisdiction before attributing candidate findings.';
  if(query.passportNumber)return 'Compare the passport number, issuing country and date of birth with the published record. A matching number alone does not confirm identity or document authenticity.';
  if(query.dob)return 'Compare the supplied date of birth with a reliable source record before attributing namesake findings to this person.';
  return 'Obtain a reliable identifier, such as a full date of birth, before attributing candidate findings to the subject.';
}
