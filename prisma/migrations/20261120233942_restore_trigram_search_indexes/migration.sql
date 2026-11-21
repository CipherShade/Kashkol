-- CreateIndex
CREATE INDEX "group_search_key_trgm_idx" ON "group" USING GIN ("search_key" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "group_phonetic_key_trgm_idx" ON "group" USING GIN ("phonetic_key" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "student_search_key_trgm_idx" ON "student" USING GIN ("search_key" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "student_phonetic_key_trgm_idx" ON "student" USING GIN ("phonetic_key" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "subject_search_key_trgm_idx" ON "subject" USING GIN ("search_key" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "subject_phonetic_key_trgm_idx" ON "subject" USING GIN ("phonetic_key" gin_trgm_ops);
