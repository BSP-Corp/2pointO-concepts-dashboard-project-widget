# Checks docs/creator/*.dg against the .ds: every Form[...] criteria/sort field, every record.Field and record.Lookup.Field must exist,
# criteria never mix && with || (Creator drops brackets in criteria),
# and one variable must never hold records of two forms. Usage: python3 scripts/check-deluge.py "<path>/2Point0concepts.ds" docs/creator
import sys,re,glob
L=open(sys.argv[1],encoding='utf-8').read().split('\n')
FORMS_END = next((i for i,l in enumerate(L) if re.match(r'^\t\t(default )?list \w+\s*$', l)), len(L))
forms={};targets={};cur=None;field=None;inside=False
for i,l in enumerate(L[:FORMS_END]):
    t=l.strip()
    if t==')' and len(l)-len(l.lstrip('\t'))==3: inside=False
    m=re.match(r'^form (\w+)$',t)
    if m: cur=m.group(1); forms[cur]={'ID','Added_Time','Modified_Time','Added_User'}; continue
    m=re.match(r'^(must have\s+)?(unique\s+)?([A-Za-z_][A-Za-z0-9_]*)$',t)
    if cur and m and i+1<len(L) and L[i+1].strip()=='(':
        indent=len(l)-len(l.lstrip('\t'))
        if indent>=4 and field and inside:
            # field of an inline subform (type = grid with its fields inside): a pseudo form "Form.Grid"
            sub=cur+'.'+field; forms.setdefault(sub,{'ID'}).add(m.group(3)); targets[(cur,field)]=sub
            continue
        field=m.group(3); forms[cur].add(field); inside=True
    m=re.match(r'^values\s*=\s*(\w+)(\[.*\])?\.ID',t)
    if cur and field and m: targets[(cur,field)]=m.group(1)
# Forms you still have to create in Creator (docs/creator/new_forms.json) count as existing
import json,os
NEW=os.path.join(sys.argv[2],'new_forms.json')
if os.path.exists(NEW):
    for name,spec in json.load(open(NEW)).items():
        if name in forms: print('NOTE: new form',name,'already exists in the .ds')
        forms.setdefault(name,{'ID','Added_Time','Modified_Time','Added_User'}).update(spec['fields'])
        for fld,t in spec.get('lookups',{}).items(): targets[(name,fld)]=t
ADDR={'address_line_1','address_line_2','district_city','state_province','postal_code','postal_Code','country','latitude','longitude'}
NAMEPART={'prefix','first_name','last_name','suffix'}
errors=0
for f in sorted(glob.glob(sys.argv[2]+'/*.dg')):
    src=open(f).read(); code=re.sub(r'//.*','',src)
    var={}
    for m in re.finditer(r'(?:for each\s+(\w+)\s+in|(\w+)\s*=)\s*(\w+)\[',code):
        v=m.group(1) or m.group(2); form=m.group(3)
        if form not in forms: print(f,'UNKNOWN FORM',form); errors+=1; continue
        if v in var and var[v]!=form: print(f,'VARIABLE REUSED for two forms:',v,var[v],form); errors+=1
        var[v]=form
    # loop vars over a list variable bound to a form fetch (projList)
    for m in re.finditer(r'for each\s+(\w+)\s+in\s+(\w+)\s*\n',code):
        if m.group(2) in var: var[m.group(1)]=var[m.group(2)]
    # subform rows: for each row in rec.Grid → the grid's form
    for m in re.finditer(r'for each\s+(\w+)\s+in\s+(\w+)\.(\w+)\s*\n',code):
        if m.group(2) in var:
            t=targets.get((var[m.group(2)],m.group(3)))
            if t: var[m.group(1)]=t
            else: print(f,'NOT A GRID',var[m.group(2)]+'.'+m.group(3)); errors+=1
    # any statement mixing && and || : Creator drops the brackets in if / assignments too (seen in DS 10)
    for n,line in enumerate(code.split('\n'),1):
        body=re.sub(r'\[[^\]]*\]','[]',line.split('//')[0])
        if '&&' in body and '||' in body:
            print(f,'MIXED && / || IN ONE STATEMENT (line %d) — build it in steps:'%n,line.strip()[:100]); errors+=1
    # insert into Form [ Field=value ... ]
    for m in re.finditer(r'insert into (\w+)\s*\[(.*?)\]\s*;?\s*\n',code,re.S):
        form=m.group(1)
        if form not in forms: print(f,'UNKNOWN FORM (insert)',form); errors+=1; continue
        for fld in re.findall(r'^\s*([A-Za-z_]\w*)\s*=',m.group(2),re.M):
            if fld!='Added_User' and fld not in forms[form]: print(f,'BAD INSERT FIELD',form,fld); errors+=1
    # criteria / sort fields
    for m in re.finditer(r'(\w+)\[([^\]]*)\](\s*sort by\s+(\w+))?',code):
        form=m.group(1)
        if form not in forms: continue
        crit=m.group(2)
        if '&&' in crit and '||' in crit:
            print(f,'MIXED && / || IN CRITERIA (Creator drops the brackets):',form+'['+crit.strip()[:90]+']'); errors+=1
        for fld in re.findall(r'([A-Za-z_]\w*)\s*(?:==|!=|>=|<=|>|<|in\b)',crit):
            if fld not in forms[form]: print(f,'BAD CRITERIA FIELD',form,fld); errors+=1
        if m.group(4) and m.group(4) not in forms[form]: print(f,'BAD SORT FIELD',form,m.group(4)); errors+=1
    # dotted usages
    for m in re.finditer(r'\b(\w+)\.([A-Za-z_]\w*)(?:\.([A-Za-z_]\w*)\b(?!\s*\())?',code):
        v,a,b=m.groups()
        if v not in var: continue
        form=var[v]
        if a in ('ID','count','toString','getAll') : continue
        if a not in forms[form]: print(f,'BAD FIELD',v,'->',form+'.'+a); errors+=1; continue
        if b and b not in ('toString','getAll','ID'):
            if b in ADDR: 
                if b not in ADDR: print(f,'BAD ADDRESS PART',b); errors+=1
                continue
            if b in NAMEPART: continue
            t=targets.get((form,a))
            if not t: print(f,'NOT A LOOKUP',form+'.'+a,'.',b); errors+=1
            elif b not in forms[t]: print(f,'BAD LOOKUP FIELD',form+'.'+a,'->',t+'.'+b); errors+=1
    print(f.split('/')[-1],'variables:',var)
print('ERRORS:',errors)
