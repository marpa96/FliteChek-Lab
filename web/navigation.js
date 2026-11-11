export function updateURL(current){
 const source=new URL(current),target=new URL('./install',source);
 const access=source.searchParams.get('access');
 if(access)target.searchParams.set('access',access);
 target.searchParams.set('update','1');
 return target.href;
}
