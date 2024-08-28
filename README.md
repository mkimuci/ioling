## Official website of IOL

This is a repository for the source code of the official website of IOL (International Linguistics Olympiad), namely [ioling.org](https://ioling.org). The website is built based on [Jekyll](https://jekyllrb.com/) and the code is a fork from [Feeling Responsive](https://github.com/Phlow/feeling-responsive).

### Step-by-step guide

1. Install Jekyll
``` 
gem install bundler jekyll
```
2. Clone this repo
3. Generate the website
```
bundle install
bundle exec jekyll build
```
4. Upload all the files generated inside the directory named `_site` to the FTP server

### Remarks

* Some confidential data are stored in a separate repo along with `booklets` and `best_solutions` directories, which contain large files.

### To-do

* Need to create a separate page for best solutions