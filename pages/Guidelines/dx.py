import csv, re, os

path = os.getcwd()
dx_file = "dx.tab"
dx_src = os.path.join(path, dx_file)

input_file = "guidelines.md"
input_src = os.path.join(path, input_file)

with open(input_src, 'r') as file:
    template = file.read()

with open(dx_src) as f:
    reader = csv.reader(f, delimiter="\t")
    dx = list(reader)
    dxt = list(map(list, zip(*dx)))

lang_no = len(dxt) - 5
word_no = len(dxt[0]) - 1

for i in range(lang_no):
    lang_code = dxt[i+4][0].split(' ')[0].lower()
    print(lang_code)
    
    output = template
    output = output.replace('xx',lang_code,1)

    for j in range(word_no):
        code = dxt[1][j+1]
        word = dxt[i+4][j+1]
        if code.startswith('\\'):
            output = output.replace(code,word,1)
            # output = re.sub('\\'+code, word, output)

    output_file = 'guidelines_' + lang_code + '.md'
    output_src = os.path.join(path, output_file)
    with open(output_src, 'w') as file:
        file.write(output)