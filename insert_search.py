with open('it-warehouse_1.html','r',encoding='utf-8') as f:
    lines=f.read().splitlines()
insert = '    <div class="bl" style="margin-bottom:14px"><input id="s_maintQ" class="search" placeholder="بحث: صنف، فئة، سيريال، جهة، رقم إذن" value="${e(SEARCH.maintQ)}" oninput="debouncedSearch(\'maintQ\',this.value)"><button onclick="clearSearch(\'maintQ\')" aria-label="x">x</button></div>'
lines.insert(439, insert)
with open('it-warehouse_1.html','w',encoding='utf-8') as f:
    f.write('\n'.join(lines))
print('done')
